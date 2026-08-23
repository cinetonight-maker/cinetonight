-- ============================================================================
-- CineTonight CMS — Stage 4 schema additions (static pages).
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Nothing here is destructive: only new columns. Existing rows keep every
-- value they have, and the site works before AND after this runs.
-- ============================================================================

-- 1. SEO overrides -----------------------------------------------------------
-- Until now a static page had no description at all, so Google invented its
-- own snippet. These let you write the search-result headline and text.
alter table pages add column if not exists meta_title       text;
alter table pages add column if not exists meta_description text;

-- 2. Soft delete (Trash) ------------------------------------------------------
alter table pages add column if not exists deleted_at timestamptz;

-- 3. Working draft for autosave ----------------------------------------------
-- Autosave writes HERE, never to `content`. That is what guarantees an
-- autosave can never alter a published page: the live page reads `content`.
alter table pages add column if not exists draft_content  text;
alter table pages add column if not exists draft_saved_at timestamptz;

create index if not exists pages_deleted_idx on pages (deleted_at);
create index if not exists pages_status_idx  on pages (status);

-- 4. Revisions ----------------------------------------------------------------
-- CMS rule: every major module has rollback. Pages had none, while blog posts
-- did. A snapshot is written on every publish/update of a PUBLISHED page, so
-- any change is recoverable. Restoring writes a new revision rather than
-- deleting history, which makes the restore itself undoable.
create table if not exists page_revisions (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references pages(id) on delete cascade,
  title       text,
  content     text,
  meta_title  text,
  meta_description text,
  slug        text,
  status      text,
  note        text,               -- "published", "updated", "before restore"
  author      text,
  created_at  timestamptz not null default now()
);

create index if not exists page_revisions_page_idx on page_revisions (page_id, created_at desc);

-- Admin-only data: all admin access goes through the service-role key in
-- /api/admin/**, which bypasses RLS, so enabling RLS with no public policy is
-- exactly the lock we want.
alter table page_revisions enable row level security;
