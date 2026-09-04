import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAudit, currentActor } from "@/lib/audit";
import { revalidateForAction } from "@/lib/revalidateCms";
import {
  normalizeSettings, validateSettings, describeSettings, settingsDirty,
  fromRow, toRow, DEFAULTS,
} from "@/lib/settingsConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/settings — site settings, on the configuration-manager contract.
 *
 *   GET                            → live + draft + history + validation
 *   PUT { action: "saveDraft" }    → draft only; the site is untouched
 *   PUT { action: "publish" }      → draft becomes live, old live snapshotted,
 *                                    every page revalidated, audit row written
 *   PUT { action: "discardDraft" }
 *   PUT { action: "rollback", revisionId } → old settings load as a DRAFT
 *
 * The live values stay in the SAME COLUMNS the public site has always read, so
 * this upgrade cannot change what a visitor sees until you publish.
 *
 * NOTE ON REVALIDATION: the site title and description appear in the root
 * layout, i.e. on every page. Invalidating every route would be exactly the
 * bulk regeneration the architecture forbids, so publishing settings clears
 * the DATA tag only — pages then pick the new values up on their own next
 * rebuild. The screen says so plainly rather than implying it is instant.
 * ========================================================================= */

const MISSING = (m: string) => /column .* does not exist|could not find the .* column|relation .* does not exist/i.test(m);
const NOT_SET_UP = {
  error: "Settings history needs its database update. Run supabase/settings_cms.sql in Supabase → SQL Editor, then reload. Saving still works without it.",
};

async function readRow() {
  const { data } = await supabaseAdmin().from("site_settings").select("*").eq("id", 1).maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function GET() {
  try {
    const row = await readRow();
    const live = row ? fromRow(row) : DEFAULTS;
    const draft = row?.draft_settings ? normalizeSettings(row.draft_settings) : live;

    let revisions: { id: string; note: string | null; author: string | null; created_at: string }[] = [];
    try {
      const { data } = await supabaseAdmin()
        .from("settings_revisions").select("id, note, author, created_at")
        .order("created_at", { ascending: false }).limit(20);
      revisions = data ?? [];
    } catch { /* history is optional until the SQL is run */ }

    return NextResponse.json({
      live, draft, revisions,
      dirty: settingsDirty(live, draft),
      problems: validateSettings(draft),
      draftSavedAt: row?.draft_saved_at ?? null,
      publishedAt: row?.published_at ?? null,
      publishedBy: row?.published_by ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not load settings: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action ?? "");
    const admin = supabaseAdmin();
    const row = await readRow();
    const live = row ? fromRow(row) : DEFAULTS;

    if (action === "saveDraft") {
      const draft = normalizeSettings(body?.settings);
      const { error } = await admin.from("site_settings")
        .update({ draft_settings: draft, draft_saved_at: new Date().toISOString() }).eq("id", 1);
      if (error) {
        if (MISSING(error.message)) return NextResponse.json(NOT_SET_UP, { status: 400 });
        throw error;
      }
      return NextResponse.json({
        ok: true, draft, revalidated: null,
        dirty: settingsDirty(live, draft), problems: validateSettings(draft),
        savedAt: new Date().toISOString(),
      });
    }

    if (action === "discardDraft") {
      const { error } = await admin.from("site_settings")
        .update({ draft_settings: null, draft_saved_at: null }).eq("id", 1);
      if (error && !MISSING(error.message)) throw error;
      return NextResponse.json({ ok: true, draft: live, revalidated: null });
    }

    if (action === "rollback") {
      const revisionId = String(body?.revisionId ?? "");
      if (!revisionId) return NextResponse.json({ error: "Missing revisionId." }, { status: 400 });
      const { data: rev, error: e1 } = await admin.from("settings_revisions").select("*").eq("id", revisionId).maybeSingle();
      if (e1) throw e1;
      if (!rev) return NextResponse.json({ error: "That version was not found." }, { status: 404 });
      const draft = normalizeSettings(rev.settings);
      const { error } = await admin.from("site_settings")
        .update({ draft_settings: draft, draft_saved_at: new Date().toISOString() }).eq("id", 1);
      if (error) {
        if (MISSING(error.message)) return NextResponse.json(NOT_SET_UP, { status: 400 });
        throw error;
      }
      return NextResponse.json({
        ok: true, draft, revalidated: null,
        dirty: settingsDirty(live, draft), problems: validateSettings(draft),
        note: "Loaded as a draft. Nothing on the site has changed yet - publish when you are happy.",
      });
    }

    if (action === "publish") {
      const draft = normalizeSettings(body?.settings ?? row?.draft_settings ?? live);
      const problems = validateSettings(draft);
      // Validation here WARNS rather than blocks: a short title is a bad idea,
      // not a broken site, and refusing to save would be the dashboard
      // overruling its owner. Only genuinely malformed values are dropped, and
      // that happens in normalizeSettings.
      const actor = await currentActor();

      try {
        await admin.from("settings_revisions").insert({
          settings: live, author: actor, note: `replaced on publish - ${describeSettings(live)}`,
        });
      } catch { /* history is a nice-to-have; the publish is not */ }

      const patch: Record<string, unknown> = {
        ...toRow(draft), id: 1, updated_at: new Date().toISOString(),
      };
      // Only set the new bookkeeping columns if they exist yet.
      let upd = await admin.from("site_settings")
        .upsert({ ...patch, draft_settings: null, draft_saved_at: null, published_at: new Date().toISOString(), published_by: actor })
        .select().single();
      if (upd.error && MISSING(upd.error.message)) upd = await admin.from("site_settings").upsert(patch).select().single();
      if (upd.error) throw upd.error;

      // Data tag only — see the note at the top of this file.
      const revalidated = await revalidateForAction({ kind: "settings" });
      await recordAudit({
        module: "settings", action: "settings",
        targetId: "site", targetLabel: "Site settings",
        before: live, after: draft, actor,
        note: `Published - ${describeSettings(draft)}`,
      });

      return NextResponse.json({ ok: true, live: draft, draft, dirty: false, problems, revalidated });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: `Could not save settings: ${(e as Error).message}` }, { status: 500 });
  }
}
