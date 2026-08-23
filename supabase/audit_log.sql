-- ============================================================================
-- CineTonight CMS — audit log.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- WHY: every publish, delete, restore and settings change must be traceable —
-- who did it, what changed, and when. The revisions tables already store the
-- full CONTENT of a change so it can be rolled back; this table stores the
-- RECORD of the change, across every module, in one place.
--
-- Nothing here is destructive: one new table and its indexes.
-- ============================================================================

create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),

  -- WHO. The signed-in admin's email, resolved from their session at the
  -- moment of the action. Null only if the session could not be read (a
  -- background job, or a token that expired mid-request) — never guessed.
  actor        text,

  -- WHAT. `module` is the dashboard section ("blog", "pages", "homepage",
  -- "discovery", "catalogue", "settings"...). `action` is the verb
  -- ("publish", "update", "unpublish", "trash", "restore", "delete",
  -- "rollback", "settings"). Both are short, stable strings so the log can be
  -- filtered without free-text searching.
  module       text not null,
  action       text not null,

  -- WHICH THING. `target_id` is the row id where there is one; `target_label`
  -- is the human name at the time of the action, kept so the log still reads
  -- correctly after the thing is renamed or deleted.
  target_id    text,
  target_label text,

  -- BEFORE / AFTER. A BOUNDED summary of what changed, not a second copy of
  -- the content — long text fields are replaced with a "<n chars>" marker by
  -- lib/audit.ts before writing. The full content lives in the module's own
  -- revisions table, which is what a rollback reads.
  before       jsonb,
  after        jsonb,

  -- Free-text detail, e.g. "restored version from 20 Aug 14:02".
  note         text,

  created_at   timestamptz not null default now()
);

create index if not exists audit_log_time_idx    on audit_log (created_at desc);
create index if not exists audit_log_module_idx  on audit_log (module, created_at desc);
create index if not exists audit_log_target_idx  on audit_log (target_id, created_at desc);

-- Admin-only data: all admin access goes through the service-role key in
-- /api/admin/**, which bypasses RLS, so enabling RLS with no public policy is
-- exactly the lock we want. A visitor can never read this table.
alter table audit_log enable row level security;

-- ============================================================================
-- RETENTION
--
-- The log is append-only and nothing in the dashboard can delete from it —
-- an audit log an admin can quietly edit is not an audit log. It is small
-- (roughly a kilobyte per action), so at CineTonight's rate it will take years
-- to matter. If you ever want to trim it, do it deliberately, here:
--
--   delete from audit_log where created_at < now() - interval '2 years';
-- ============================================================================
