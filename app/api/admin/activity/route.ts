import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AUDIT_MODULES, AUDIT_ACTIONS, sanitizeSearch } from "@/lib/activityFilters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * The audit log, for /admin/activity.
 *
 * READ ONLY — AND THAT IS ENFORCED BY OMISSION.
 * This file exports GET and nothing else. There is no POST, PUT, PATCH or
 * DELETE handler, so Next returns 405 for every one of them. An audit log an
 * admin can edit or delete from the dashboard is not an audit log. A test in
 * tests/activityReadOnly.test.mjs fails the build if a mutating handler is
 * ever added here.
 *
 * Filters (all optional, all combinable):
 *   ?module=blog          one module
 *   ?action=publish       one action
 *   ?actor=me@x.com       one admin
 *   ?from=<iso>&to=<iso>  date range
 *   ?q=text               search the item name and the note
 *   ?before=<iso>         pagination cursor (older than this)
 *   ?facets=1             the distinct admins/actions/modules actually present
 * ========================================================================= */

const PAGE = 50;

/** Is this "the table isn't there yet"? */
const isMissingTable = (msg: string) =>
  /relation .* does not exist|could not find the table/i.test(msg);

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;

  // Unknown values are DROPPED, not passed through — the filter can only ever
  // narrow the list to a value this codebase actually writes.
  const module = AUDIT_MODULES.includes(p.get("module") as never) ? p.get("module")! : null;
  const action = AUDIT_ACTIONS.includes(p.get("action") as never) ? p.get("action")! : null;
  const actor = p.get("actor")?.slice(0, 160) || null;
  const from = p.get("from");
  const to = p.get("to");
  const before = p.get("before");
  const search = sanitizeSearch(p.get("q") ?? "");

  try {
    const admin = supabaseAdmin();

    /* ---- facets: the values actually present, so the dropdowns offer real
       options rather than a hard-coded guess (CMS Rule 6). ---- */
    if (p.get("facets") === "1") {
      const { data, error } = await admin
        .from("audit_log")
        .select("actor, action, module")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) {
        if (isMissingTable(error.message)) return NextResponse.json({ actors: [], actions: [], modules: [], unsupported: true });
        throw error;
      }
      const rows = (data ?? []) as { actor: string | null; action: string; module: string }[];
      const uniq = (xs: (string | null)[]) =>
        [...new Set(xs.filter((x): x is string => !!x))].sort();
      return NextResponse.json({
        actors: uniq(rows.map((r) => r.actor)),
        actions: uniq(rows.map((r) => r.action)),
        modules: uniq(rows.map((r) => r.module)),
      });
    }

    let q = admin
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE + 1);

    if (module) q = q.eq("module", module);
    if (action) q = q.eq("action", action);
    if (actor) q = q.eq("actor", actor);
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    if (before) q = q.lt("created_at", before);
    if (search) {
      // sanitizeSearch has already removed the characters that would break out
      // of PostgREST's `or=` grammar, so this can only ever be a literal match
      // against these two columns.
      q = q.or(`target_label.ilike.%${search}%,note.ilike.%${search}%`);
    }

    const { data, error } = await q;
    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ entries: [], hasMore: false, unsupported: true });
      }
      throw error;
    }

    const rows = data ?? [];
    return NextResponse.json({
      entries: rows.slice(0, PAGE),
      hasMore: rows.length > PAGE,
      applied: { module, action, actor, from, to, search: search || null },
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not load the activity log: ${(e as Error).message}` }, { status: 500 });
  }
}
