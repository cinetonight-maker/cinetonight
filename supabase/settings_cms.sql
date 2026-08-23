-- ============================================================================
-- CineTonight CMS — Site Settings, brought up to the CMS safety rules.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- The existing `site_settings` row REMAINS the live one, and the public site
-- keeps reading exactly the columns it always did — that is deliberate, so
-- this change cannot affect a visitor even for a moment. What is added is a
-- draft alongside it, plus history.
-- ============================================================================

-- Draft: your edits, invisible to the site until you publish.
alter table site_settings add column if not exists draft_settings jsonb;
alter table site_settings add column if not exists draft_saved_at  timestamptz;
alter table site_settings add column if not exists published_at    timestamptz;
alter table site_settings add column if not exists published_by    text;

-- Every publish snapshots the settings it replaced, so any previous set can be
-- restored. Restoring loads them as a DRAFT, so it is never an unpreviewed
-- change to the live site.
create table if not exists settings_revisions (
  id         uuid primary key default gen_random_uuid(),
  settings   jsonb not null,
  note       text,
  author     text,
  created_at timestamptz not null default now()
);

create index if not exists settings_revisions_time_idx on settings_revisions (created_at desc);

-- Admin-only: no public policy. The live settings row keeps whatever read
-- policy it already has, untouched.
alter table settings_revisions enable row level security;
