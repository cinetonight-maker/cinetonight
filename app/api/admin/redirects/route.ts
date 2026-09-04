import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { recordAudit, currentActor } from "@/lib/audit";
import { revalidateForAction } from "@/lib/revalidateCms";
import {
  planRuleWrite, validateRule, normalizePath, parseBulk, bulkSummary,
  findChains, resolveRedirect, MAX_ENABLED_RULES,
  type RedirectStatus, type RedirectReason,
} from "@/lib/redirects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/redirects — the Redirect Manager's data layer.
 *
 *   GET                                → every rule + health + live slugs
 *   GET ?test=/some/path               → what would happen to this URL
 *   POST { from, to, status, reason }  → create, ALWAYS disabled
 *   POST { action: "bulkPreview", csv } → dry run, writes NOTHING
 *   POST { action: "bulkApply", csv }   → writes every valid row, all disabled
 *   PUT  { id, ... }                    → edit / enable / disable
 *   DELETE ?id=                         → remove
 *
 * EVERY safety rule lives here, server-side, not in the screen. A rule that
 * reaches the table has already been normalised, validated, loop-checked,
 * chain-flattened and checked against live content.
 * ========================================================================= */

const missingTable = (e: unknown) => {
  const m = (e as { message?: string })?.message ?? "";
  const code = (e as { code?: string })?.code ?? "";
  return code === "42P01" || /relation .*redirects.* does not exist|could not find the table/i.test(m);
};

const SETUP_MESSAGE =
  "Redirects need their database table. Run supabase/redirects.sql in Supabase → SQL Editor, " +
  "then reload. Nothing on the site is affected until you do.";

interface Row {
  id: string; from_path: string; to_path: string; status: number;
  enabled: boolean; reason: string; note: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

const loadAll = async (): Promise<Row[]> => {
  const { data, error } = await supabaseAdmin()
    .from("redirects").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Row[];
};

/** Enabled rules as from → to. This is the set that constrains loops and
 *  chains; disabled rules redirect nothing, so they cannot form either. */
const enabledMap = (rows: Row[]) =>
  new Map(rows.filter((r) => r.enabled).map((r) => [r.from_path, r.to_path]));

/**
 * Every path that currently resolves to real content, as one query set.
 *
 * Used for the shadow check: a rule whose source is a live page would make that
 * page disappear, which is the single most damaging mistake this screen can
 * make. Bounded and cheap — published slugs only, no per-path lookups.
 */
async function liveSlugs(): Promise<Set<string>> {
  const admin = supabaseAdmin();
  const out = new Set<string>(["/", "/blog", "/discover", "/movies", "/tv-shows", "/web-series",
    "/trending", "/latest", "/genres", "/free-movies", "/faq", "/follow", "/search", "/links"]);
  const add = (p: string) => out.add(p.toLowerCase());
  try {
    const { data } = await admin.from("blog_posts").select("slug, status").eq("status", "published");
    for (const r of (data ?? []) as { slug: string }[]) add(`/blog/${r.slug}`);
  } catch { /* table shapes vary before migrations; the check degrades, never fails */ }
  try {
    const { data } = await admin.from("pages").select("slug, status").eq("status", "published");
    for (const r of (data ?? []) as { slug: string }[]) add(`/${r.slug}`);
  } catch { /* as above */ }
  try {
    const { data } = await admin.from("classics").select("slug");
    for (const r of (data ?? []) as { slug: string }[]) add(`/free-movies/${r.slug}`);
  } catch { /* as above */ }
  return out;
}

/* -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rows = await loadAll();

    // ?test= — the URL tester. Runs the SAME resolver the request path uses,
    // so the screen cannot disagree with what a visitor would actually get.
    const probe = url.searchParams.get("test");
    if (probe !== null) {
      const path = normalizePath(probe);
      if (!path) return NextResponse.json({ test: { path: probe, verdict: "invalid" } });
      const live = await liveSlugs();
      const enabled = new Map(rows.filter((r) => r.enabled)
        .map((r) => [r.from_path, { to: r.to_path, status: r.status as RedirectStatus }]));
      const hit = resolveRedirect(enabled, path);
      const disabled = rows.find((r) => r.from_path === path && !r.enabled);
      return NextResponse.json({
        test: {
          path,
          verdict: hit.match ? "redirect" : disabled ? "disabled" : live.has(path) ? "live" : "notfound",
          to: hit.to ?? disabled?.to_path ?? null,
          status: hit.status ?? disabled?.status ?? null,
        },
      });
    }

    const enabled = enabledMap(rows);
    return NextResponse.json({
      rules: rows,
      health: {
        total: rows.length,
        enabled: enabled.size,
        cap: MAX_ENABLED_RULES,
        // Should always be empty — flattening makes chains impossible. Shown so
        // a hand-edited table cannot hide one.
        chains: findChains(enabled),
      },
    });
  } catch (e) {
    if (missingTable(e)) return NextResponse.json({ error: SETUP_MESSAGE, needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: `Could not load redirects: ${(e as Error).message}` }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const admin = supabaseAdmin();
    const actor = await currentActor();

    /* ---- bulk import: preview writes nothing ---- */
    if (body?.action === "bulkPreview" || body?.action === "bulkApply") {
      const reason = (body?.reason ?? "migration") as RedirectReason;
      const parsed = parseBulk(String(body?.csv ?? ""), reason);
      const rows = await loadAll();
      const live = await liveSlugs();
      const existingFrom = new Set(rows.map((r) => r.from_path));

      // Second pass: cross-check every valid row against the site as it is.
      const checked = parsed.map((r) => {
        if (!r.ok) return r;
        if (live.has(r.from!)) return { ...r, ok: false, error: "That address is a live page - redirecting it would make the page disappear." };
        if (existingFrom.has(r.from!)) return { ...r, ok: false, error: "A rule for that address already exists." };
        return r;
      });
      const summary = bulkSummary(checked);

      if (body.action === "bulkPreview") {
        return NextResponse.json({ preview: checked, summary });
      }

      const valid = checked.filter((r) => r.ok);
      if (!valid.length) return NextResponse.json({ error: "Nothing valid to import.", preview: checked, summary }, { status: 400 });
      if (enabledMap(rows).size + 0 > MAX_ENABLED_RULES) {
        return NextResponse.json({ error: `That would pass the ${MAX_ENABLED_RULES}-rule limit.` }, { status: 400 });
      }

      // Everything lands DISABLED. An import can therefore never change the
      // site until someone has looked at what arrived.
      const insert = valid.map((r) => ({
        from_path: r.from!, to_path: r.to!, status: r.status!, reason: r.reason!,
        enabled: false, note: "Bulk import", created_by: actor,
      }));
      const { error } = await admin.from("redirects").insert(insert);
      if (error) throw error;

      await recordAudit({
        module: "redirects", action: "import", targetLabel: `${insert.length} rules`,
        before: null, after: { imported: insert.length, reason },
        note: `Bulk import - ${insert.length} rules added, all disabled`,
      });
      // Nothing is enabled, so nothing public changed: no revalidation.
      return NextResponse.json({ ok: true, imported: insert.length, summary });
    }

    /* ---- single create ---- */
    const rows = await loadAll();
    const live = await liveSlugs();
    const shape = validateRule(body);
    if (!shape.ok) return NextResponse.json({ error: shape.errors.join(" ") }, { status: 400 });

    if (live.has(shape.from!)) {
      return NextResponse.json({
        error: "That address is a live page. Redirecting it would make the page disappear - " +
               "unpublish or delete the page first if that is really what you want.",
      }, { status: 400 });
    }
    if (rows.some((r) => r.from_path === shape.from)) {
      return NextResponse.json({ error: "A rule for that address already exists." }, { status: 400 });
    }

    const plan = planRuleWrite(enabledMap(rows), { ...body, enabled: false });
    if (!plan.ok) return NextResponse.json({ error: plan.errors.join(" ") }, { status: 400 });

    const { data, error } = await admin.from("redirects")
      .insert({ ...plan.rule, created_by: actor }).select().single();
    if (error) throw error;

    await recordAudit({
      module: "redirects", action: "create",
      targetId: data.id, targetLabel: `${data.from_path} → ${data.to_path}`,
      before: null, after: data,
      note: `Created (disabled) - ${data.reason}`,
    });
    // Created disabled, so the public site is unchanged: no revalidation.
    return NextResponse.json({ ok: true, rule: data, flattened: plan.rule!.to_path !== normalizePath(body?.to) });
  } catch (e) {
    if (missingTable(e)) return NextResponse.json({ error: SETUP_MESSAGE, needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: `Could not save that redirect: ${(e as Error).message}` }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const admin = supabaseAdmin();
    const rows = await loadAll();
    const before = rows.find((r) => r.id === id);
    if (!before) return NextResponse.json({ error: "That rule no longer exists." }, { status: 404 });

    const wantsEnabled = typeof body.enabled === "boolean" ? body.enabled : before.enabled;
    const live = await liveSlugs();

    const shape = validateRule({
      from: body.from ?? before.from_path,
      to: body.to ?? before.to_path,
      status: body.status ?? before.status,
      reason: body.reason ?? before.reason,
    });
    if (!shape.ok) return NextResponse.json({ error: shape.errors.join(" ") }, { status: 400 });

    if (live.has(shape.from!)) {
      return NextResponse.json({ error: "That address is a live page - redirecting it would make the page disappear." }, { status: 400 });
    }
    if (rows.some((r) => r.id !== id && r.from_path === shape.from)) {
      return NextResponse.json({ error: "Another rule already covers that address." }, { status: 400 });
    }
    if (wantsEnabled && !before.enabled && enabledMap(rows).size >= MAX_ENABLED_RULES) {
      return NextResponse.json({ error: `The ${MAX_ENABLED_RULES}-rule limit is already reached. Disable something first.` }, { status: 400 });
    }

    const plan = planRuleWrite(enabledMap(rows), {
      from: shape.from, to: shape.to, status: shape.status, reason: shape.reason,
      note: body.note ?? before.note, enabled: wantsEnabled,
    });
    if (!plan.ok) return NextResponse.json({ error: plan.errors.join(" ") }, { status: 400 });

    const { data, error } = await admin.from("redirects")
      .update({ ...plan.rule, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;

    // Rewrites keep the table chain-free when this rule's source or target
    // moved. Only applied when the rule is live — a disabled rule redirects
    // nothing and so cannot be part of a chain.
    if (wantsEnabled && plan.rewrites.length) {
      for (const rw of plan.rewrites) {
        await admin.from("redirects").update({ to_path: rw.to_path, updated_at: new Date().toISOString() })
          .eq("from_path", rw.from_path);
      }
    }

    const action = before.enabled !== wantsEnabled ? (wantsEnabled ? "enable" : "disable") : "update";
    await recordAudit({
      module: "redirects", action,
      targetId: id, targetLabel: `${data.from_path} → ${data.to_path}`,
      before, after: data,
      note: plan.rewrites.length ? `${plan.rewrites.length} other rule(s) re-pointed to avoid a chain` : undefined,
    });

    // Only a change in what is LIVE can affect a visitor.
    const publicChange = before.enabled || wantsEnabled;
    const affected = [before.from_path, data.from_path, ...plan.rewrites.map((r) => r.from_path)];
    const revalidated = publicChange
      ? await revalidateForAction({ kind: "redirect", sources: [...new Set(affected)] })
      : null;
    return NextResponse.json({ ok: true, rule: data, rewrites: plan.rewrites.length, revalidated });
  } catch (e) {
    if (missingTable(e)) return NextResponse.json({ error: SETUP_MESSAGE, needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: `Could not update that redirect: ${(e as Error).message}` }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const admin = supabaseAdmin();
    const { data: before } = await admin.from("redirects").select("*").eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ error: "That rule no longer exists." }, { status: 404 });

    const { error } = await admin.from("redirects").delete().eq("id", id);
    if (error) throw error;

    await recordAudit({
      module: "redirects", action: "delete",
      targetId: id, targetLabel: `${before.from_path} → ${before.to_path}`,
      before, after: null,
      note: "Redirect deleted",
    });

    const revalidated = before.enabled
      ? await revalidateForAction({ kind: "redirect", sources: [before.from_path] })
      : null;
    return NextResponse.json({ ok: true, revalidated });
  } catch (e) {
    if (missingTable(e)) return NextResponse.json({ error: SETUP_MESSAGE, needsSetup: true }, { status: 400 });
    return NextResponse.json({ error: `Could not delete that redirect: ${(e as Error).message}` }, { status: 500 });
  }
}
