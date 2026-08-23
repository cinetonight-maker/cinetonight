import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * One audit entry, for /admin/activity/<id>.
 *
 * READ ONLY, ENFORCED BY OMISSION — GET and nothing else, same as the list
 * route. A test fails the build if a mutating handler is ever added.
 *
 * As well as the entry it answers "can this be undone?", which is the question
 * anyone opening an audit entry actually has. Answering it needs three facts,
 * all read from the database rather than assumed:
 *   1. does the item still exist, or was it permanently deleted?
 *   2. does its module keep version history at all?
 *   3. is there a snapshot from at or before this moment to go back to?
 * ========================================================================= */

/** Which table holds the item, and which holds its history. Modules with no
 *  history yet are simply absent — the drawer then says so plainly rather
 *  than offering a button that would not work. */
const SOURCES: Record<string, { table: string; revisions: string; fk: string; label: string; editor: string }> = {
  blog: { table: "blog_posts", revisions: "blog_revisions", fk: "post_id", label: "title", editor: "/admin/blog" },
  pages: { table: "pages", revisions: "page_revisions", fk: "page_id", label: "title", editor: "/admin/pages" },
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const admin = supabaseAdmin();
    const { data: entry, error } = await admin.from("audit_log").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (/relation .* does not exist|could not find the table/i.test(error.message)) {
        return NextResponse.json({ error: "The activity log is not switched on yet." }, { status: 404 });
      }
      throw error;
    }
    if (!entry) return NextResponse.json({ error: "That activity entry was not found." }, { status: 404 });

    const src = SOURCES[entry.module as string];
    const rollback: {
      supported: boolean; available: boolean; reason: string;
      editorHref: string | null; revisionCount: number; itemExists: boolean;
    } = {
      supported: !!src,
      available: false,
      reason: "",
      editorHref: src?.editor ?? null,
      revisionCount: 0,
      itemExists: false,
    };

    if (!src) {
      rollback.reason = "This module does not keep version history yet, so there is nothing to roll back to.";
    } else if (!entry.target_id) {
      rollback.reason = "This entry is not attached to a single item.";
    } else {
      const { data: item } = await admin.from(src.table).select("id").eq("id", entry.target_id).maybeSingle();
      rollback.itemExists = !!item;

      const { data: revs } = await admin
        .from(src.revisions)
        .select("id, created_at, note")
        .eq(src.fk, entry.target_id)
        .lte("created_at", entry.created_at)
        .order("created_at", { ascending: false })
        .limit(5);
      rollback.revisionCount = (revs ?? []).length;

      if (!item) {
        rollback.reason = "The item was permanently deleted, so there is nothing left to roll back.";
      } else if (rollback.revisionCount === 0) {
        rollback.reason = "No saved version exists from before this change.";
      } else {
        rollback.available = true;
        rollback.reason = `${rollback.revisionCount} saved version${rollback.revisionCount === 1 ? "" : "s"} exist from before this change.`;
      }
    }

    return NextResponse.json({ entry, rollback });
  } catch (e) {
    return NextResponse.json({ error: `Could not load that entry: ${(e as Error).message}` }, { status: 500 });
  }
}
