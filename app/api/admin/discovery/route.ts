import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidateForAction } from "@/lib/revalidateCms";
import { recordAudit, currentActor } from "@/lib/audit";
import {
  normalizeConfig, validateConfig, describeConfig, isDirty, DEFAULT_CONFIG,
} from "@/lib/discoveryConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/discovery — the Discovery Manager's back end.
 *
 * The configuration-manager contract (docs/CMS-DESIGN-RULES.md Part 3):
 *
 *   GET                          → live + draft + history + validation
 *   PUT { action: "saveDraft" }  → draft only. Cannot change the site.
 *   PUT { action: "publish" }    → draft becomes live, old live snapshotted,
 *                                  "/" revalidated, one audit row written.
 *   PUT { action: "discardDraft" } → throw the draft away.
 *   PUT { action: "rollback", revisionId } → an old version becomes the draft.
 *
 * NOTE what rollback does NOT do: it does not publish. Restoring loads the old
 * version as a DRAFT so you can look at it, preview it and then publish it
 * deliberately. A rollback that went straight to the live site would be the
 * one un-previewable action in the whole CMS.
 * ========================================================================= */

const MISSING = (m: string) => /relation .* does not exist|could not find the table/i.test(m);
const NOT_SET_UP = {
  error: "The Discovery Manager needs its database table. Run supabase/discovery_cms.sql in Supabase → SQL Editor, then reload. Nothing on the site is affected until you do.",
};

async function readRow() {
  const { data, error } = await supabaseAdmin()
    .from("discovery_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET() {
  try {
    const row = await readRow();
    const live = normalizeConfig(row?.live_config ?? DEFAULT_CONFIG);
    // A draft that has never been started IS the live version — that is what
    // "start from what is live" means, and it keeps the editor honest.
    const draft = normalizeConfig(row?.draft_config ?? row?.live_config ?? DEFAULT_CONFIG);

    let revisions: { id: string; note: string | null; author: string | null; created_at: string }[] = [];
    try {
      const { data } = await supabaseAdmin()
        .from("discovery_revisions")
        .select("id, note, author, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      revisions = data ?? [];
    } catch { /* history is optional until the SQL is run */ }

    return NextResponse.json({
      live, draft, revisions,
      dirty: isDirty(row?.live_config ?? DEFAULT_CONFIG, draft),
      problems: validateConfig(draft),
      usingDefault: !row?.live_config,
      draftSavedAt: row?.draft_saved_at ?? null,
      publishedAt: row?.published_at ?? null,
      publishedBy: row?.published_by ?? null,
    });
  } catch (e) {
    if (MISSING((e as Error).message)) return NextResponse.json(NOT_SET_UP, { status: 400 });
    return NextResponse.json({ error: `Could not load the discovery settings: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const admin = supabaseAdmin();
    const row = await readRow();
    const liveNow = normalizeConfig(row?.live_config ?? DEFAULT_CONFIG);

    /* ---- draft only. Invisible to visitors, so nothing is revalidated and
       nothing is logged — same rule as blog autosave. ---- */
    if (action === "saveDraft") {
      const draft = normalizeConfig(body?.config);
      const { error } = await admin.from("discovery_config")
        .update({ draft_config: draft, draft_saved_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
      return NextResponse.json({
        ok: true, draft, revalidated: null,
        dirty: isDirty(row?.live_config ?? DEFAULT_CONFIG, draft),
        problems: validateConfig(draft),
        savedAt: new Date().toISOString(),
      });
    }

    if (action === "discardDraft") {
      const { error } = await admin.from("discovery_config")
        .update({ draft_config: null, draft_saved_at: null }).eq("id", 1);
      if (error) throw error;
      return NextResponse.json({ ok: true, draft: liveNow, revalidated: null });
    }

    /* ---- rollback: an old version becomes the DRAFT, never the live site. ---- */
    if (action === "rollback") {
      const revisionId = String(body?.revisionId ?? "");
      if (!revisionId) return NextResponse.json({ error: "Missing revisionId." }, { status: 400 });
      const { data: rev, error: e1 } = await admin
        .from("discovery_revisions").select("*").eq("id", revisionId).maybeSingle();
      if (e1) throw e1;
      if (!rev) return NextResponse.json({ error: "That version was not found." }, { status: 404 });

      const draft = normalizeConfig(rev.config);
      const { error } = await admin.from("discovery_config")
        .update({ draft_config: draft, draft_saved_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      return NextResponse.json({
        ok: true, draft, revalidated: null,
        dirty: isDirty(row?.live_config ?? DEFAULT_CONFIG, draft),
        problems: validateConfig(draft),
        note: "Loaded as a draft. Preview it, then Publish when you are happy — nothing on the site has changed yet.",
      });
    }

    /* ---- publish ---- */
    if (action === "publish") {
      const draft = normalizeConfig(body?.config ?? row?.draft_config ?? row?.live_config ?? DEFAULT_CONFIG);
      const problems = validateConfig(draft);
      if (problems.length) return NextResponse.json({ error: problems[0], problems }, { status: 400 });

      const actor = await currentActor();

      // Snapshot what is being replaced FIRST, so the current discovery is
      // recoverable even if the write below fails halfway.
      try {
        await admin.from("discovery_revisions").insert({
          config: liveNow, author: actor,
          note: `replaced on publish — ${describeConfig(liveNow)}`,
        });
      } catch { /* history is a nice-to-have; the publish is not */ }

      const { error } = await admin.from("discovery_config").update({
        live_config: draft,
        draft_config: null,
        draft_saved_at: null,
        published_at: new Date().toISOString(),
        published_by: actor,
      }).eq("id", 1);
      if (error) throw error;

      const revalidated = await revalidateForAction({ kind: "discovery" });
      await recordAudit({
        module: "discovery", action: "publish",
        targetId: "discovery", targetLabel: "Discovery experience",
        before: liveNow, after: draft, actor,
        note: `Published — ${describeConfig(draft)}`,
      });

      return NextResponse.json({ ok: true, live: draft, draft, dirty: false, problems: [], revalidated });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (MISSING((e as Error).message)) return NextResponse.json(NOT_SET_UP, { status: 400 });
    return NextResponse.json({ error: `Could not save the discovery settings: ${(e as Error).message}` }, { status: 500 });
  }
}
