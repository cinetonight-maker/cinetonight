import "server-only";
import { supabaseAdmin } from "./supabase/admin";

/* ============================================================================
 * lib/retention.ts — keeping history bounded on a 500 MB database.
 *
 * TWO MECHANISMS, on purpose:
 *
 * 1. PRUNE ON WRITE (here). Every time a revision is created, the oldest
 *    revisions for THAT post beyond the keep-count are removed. Deterministic,
 *    bounded, and needs no scheduler — which matters, because there is no cron
 *    trigger configured for this project and a retention policy that depends
 *    on one nobody set up is not a policy.
 *
 * 2. prune_retention() in supabase/retention.sql, run weekly by pg_cron where
 *    it is available and by a button on System Health where it is not. That
 *    one also covers audit_log and the event logs, which have no natural
 *    per-parent write to hang off.
 *
 * Revisions are the expensive ones: each holds a full content snapshot, so a
 * 30 KB article edited twenty times is 600 KB of history for one post.
 * ========================================================================= */

/** How many revisions to keep per parent. Deep enough to undo a bad week,
 *  shallow enough that a hundred posts cannot fill the database. */
export const KEEP_REVISIONS_PER_PARENT = 20;

/**
 * Drop the oldest revisions for one parent, keeping the newest `keep`.
 *
 * BEST EFFORT BY DESIGN — failure is swallowed. This runs immediately after a
 * successful publish, and a housekeeping problem must never turn a save the
 * author already completed into an error. The weekly sweep catches whatever
 * this misses.
 */
export async function pruneRevisions(
  table: "blog_revisions" | "page_revisions",
  parentColumn: "post_id" | "page_id",
  parentId: string | null | undefined,
  keep: number = KEEP_REVISIONS_PER_PARENT,
): Promise<void> {
  if (!parentId) return;
  try {
    const admin = supabaseAdmin();
    // Read ids newest-first, skip the ones being kept, delete the rest. Two
    // small queries beat one clever one here: PostgREST has no "delete with
    // offset", and the id list is bounded by how many revisions exist.
    const { data, error } = await admin
      .from(table)
      .select("id")
      .eq(parentColumn, parentId)
      .order("created_at", { ascending: false })
      .range(keep, keep + 199);
    if (error || !data?.length) return;
    await admin.from(table).delete().in("id", data.map((r: { id: string }) => r.id));
  } catch {
    /* history housekeeping must never fail a save */
  }
}

/** Run the full sweep (audit log, every revision table, event logs).
 *  Returns what it reclaimed, or null when supabase/retention.sql has not
 *  been run yet — the dashboard says so rather than reporting an error. */
export async function runRetentionSweep(): Promise<{ table_name: string; rows_deleted: number }[] | null> {
  try {
    const { data, error } = await supabaseAdmin().rpc("prune_retention");
    if (error) return null;
    return (data ?? []) as { table_name: string; rows_deleted: number }[];
  } catch {
    return null;
  }
}
