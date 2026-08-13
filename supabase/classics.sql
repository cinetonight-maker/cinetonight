-- Free Classics table — the dashboard-managed "watch full movie legally"
-- shelf (Dashboard → Free Movies). Run this ONCE in Supabase Dashboard →
-- SQL Editor, then seed it from the bundled list with:
--   node scripts/sync-classics.mjs
--
-- Safe to re-run: everything is IF NOT EXISTS / DROP-then-CREATE.

create table if not exists classics (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  year        int  not null,
  source_type text not null default 'archive',
  source_id   text not null,
  tmdb_id     int,
  description text not null default '',
  runtime     text,
  genre       text,
  status      text not null default 'draft',
  note        text,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint classics_source_type_check check (source_type in ('archive', 'youtube')),
  constraint classics_status_check      check (status in ('draft', 'published'))
);

alter table classics enable row level security;

-- The public site (anon key) may only ever see published films; the admin
-- dashboard talks to this table through the service-role key, which
-- bypasses RLS, so drafts stay editor-only.
drop policy if exists "classics_public_read" on classics;
create policy "classics_public_read" on classics for select using (status = 'published');
