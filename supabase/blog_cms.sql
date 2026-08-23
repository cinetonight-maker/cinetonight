-- ============================================================================
-- CineTonight CMS — Stage 2 schema additions (blog).
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Nothing here is destructive: only new columns and one new table. Existing
-- rows keep every value they have; every added column is nullable or has a
-- default, so the current site keeps working before AND after this runs.
-- ============================================================================

-- 1. Soft delete (Trash) ------------------------------------------------------
-- Posts are no longer hard-deleted by default. `deleted_at` set = in Trash;
-- the public site and the default admin list both filter it out.
alter table blog_posts add column if not exists deleted_at timestamptz;

-- 2. Featured-image alt text --------------------------------------------------
-- Accessibility + SEO. Nullable: existing posts simply have none yet.
alter table blog_posts add column if not exists image_alt text;

-- 3. Working draft for autosave ----------------------------------------------
-- Autosave writes HERE, never to `body`. That is what guarantees an autosave
-- can never alter a published article: the live page always reads `body`.
alter table blog_posts add column if not exists draft_body text;
alter table blog_posts add column if not exists draft_saved_at timestamptz;

-- 4. Tags ---------------------------------------------------------------------
alter table blog_posts add column if not exists tags text[] default '{}';

-- 5. Revisions ----------------------------------------------------------------
-- A snapshot is written on every publish/update of a published post, so any
-- change is recoverable. Restoring creates a NEW revision rather than deleting
-- history, so the timeline is never lost.
create table if not exists blog_revisions (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references blog_posts(id) on delete cascade,
  title       text,
  body        text,
  excerpt     text,
  meta_title  text,
  meta_description text,
  image_url   text,
  image_alt   text,
  cat         text,
  status      text,
  note        text,               -- "published", "updated", "restored from …"
  author      text,               -- admin email when available
  created_at  timestamptz not null default now()
);

create index if not exists blog_revisions_post_idx on blog_revisions (post_id, created_at desc);
create index if not exists blog_posts_deleted_idx on blog_posts (deleted_at);
create index if not exists blog_posts_status_idx  on blog_posts (status, publish_at);

-- 6. RLS ----------------------------------------------------------------------
-- Revisions are admin-only data: no public read. All admin access goes through
-- the service-role key in /api/admin/**, which bypasses RLS, so enabling RLS
-- with no public policy is exactly the lock we want.
alter table blog_revisions enable row level security;
