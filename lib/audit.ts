import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { supabaseServer } from "./supabase/server";
import { summarizeRow, describeChange } from "./auditSummary";
import { AUDIT_MODULES, AUDIT_ACTIONS } from "./activityFilters";

/* ============================================================================
 * lib/audit.ts — "who changed what, and when", for every dashboard module.
 *
 * CMS Rule 9. Every publish, delete, restore and settings change writes one
 * row here. Reading the log answers the only question that matters after
 * something goes wrong: *what did we change just before this broke?*
 *
 * THREE PROPERTIES THIS FILE GUARANTEES
 *
 *  1. IT CANNOT BREAK A SAVE. Every call is best-effort and swallowed. The
 *     content write has already succeeded by the time this runs; failing to
 *     write a log row must never be reported to the author as a failed save.
 *
 *  2. IT IS BOUNDED. Snapshots go through lib/auditSummary.ts, which truncates
 *     long text to a "<n chars>" marker and drops anything that looks like a
 *     secret. The log records THAT a change happened and WHICH fields moved;
 *     the full content lives in the module's revisions table, which is what a
 *     rollback reads. One row is roughly a kilobyte.
 *
 *  3. IT IS APPEND-ONLY. Nothing in the dashboard deletes from it. An audit
 *     log an admin can quietly edit is not an audit log.
 *
 * NOT LOGGED: autosave and draft discard. They are invisible to the public,
 * happen every twenty seconds while typing, and would bury the entries that
 * matter. Draft state is recoverable from the draft columns themselves.
 * ========================================================================= */

/* The module and action names are defined ONCE, in lib/activityFilters.ts,
 * and the types are derived from those lists. That is deliberate: it makes
 * "every action the code logs is also filterable in the UI" a COMPILE ERROR
 * rather than something a test has to go looking for. Adding a new verb means
 * adding it to that list, which adds it to the filter dropdown at the same
 * moment. */
export type AuditModule = (typeof AUDIT_MODULES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  module: AuditModule;
  action: AuditAction;
  targetId?: string | null;
  targetLabel?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
  /** Pass the request when you have it so the actor can be resolved. */
  actor?: string | null;
}

/** The signed-in admin's email, from their own session — never from the
 *  request body, which a client could set to anything. Returns null rather
 *  than guessing if the session cannot be read. */
export async function currentActor(): Promise<string | null> {
  try {
    const sb = await supabaseServer();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** Write one audit row. Never throws, never blocks the caller's result. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const actor = entry.actor ?? (await currentActor());
    const before = entry.before === undefined ? null : summarizeRow(entry.before);
    const after = entry.after === undefined ? null : summarizeRow(entry.after);
    const note =
      entry.note ??
      (entry.before !== undefined && entry.after !== undefined ? describeChange(entry.before, entry.after) : null);

    await supabaseAdmin().from("audit_log").insert({
      actor,
      module: entry.module,
      action: entry.action,
      target_id: entry.targetId ?? null,
      target_label: entry.targetLabel ?? null,
      before,
      after,
      note,
    });
  } catch (e) {
    // Includes "table does not exist" before supabase/audit_log.sql has been
    // run — the dashboard keeps working, it just is not logging yet.
    console.error("[cinetonight] audit log write failed (save was NOT affected):", e);
  }
}
