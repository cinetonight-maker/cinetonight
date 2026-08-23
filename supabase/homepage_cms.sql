-- ============================================================================
-- CineTonight CMS — Stage 5: Homepage Manager.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- This is the CONFIGURATION MANAGER pattern from docs/CMS-DESIGN-RULES.md:
-- one row holding BOTH the live version and the draft version, plus a
-- revisions table. The public homepage reads `live_config` only, which is the
-- same structural guarantee that makes blog drafts safe — editing the draft
-- cannot change the site, whatever else goes wrong.
--
-- Nothing here is destructive. The existing `home_config` table is untouched.
-- ============================================================================

create table if not exists homepage_config (
  id           int primary key default 1,
  live_config  jsonb,          -- what visitors see. NULL = the shipped default.
  draft_config jsonb,          -- your edits. Invisible to visitors, always.
  draft_saved_at timestamptz,
  published_at   timestamptz,
  published_by   text,
  constraint homepage_config_single_row check (id = 1)
);

insert into homepage_config (id) values (1) on conflict (id) do nothing;

-- Every publish snapshots the version it replaced, so any homepage you have
-- ever had can be restored. Rolling back writes a new revision rather than
-- deleting one, so a rollback is itself undoable.
create table if not exists homepage_revisions (
  id         uuid primary key default gen_random_uuid(),
  config     jsonb not null,
  note       text,
  author     text,
  created_at timestamptz not null default now()
);

create index if not exists homepage_revisions_time_idx on homepage_revisions (created_at desc);

-- The homepage config is PUBLIC-READ on purpose: the site renders from it.
-- Only `live_config` is exposed; the draft is never selected by public code
-- (see lib/homepage.ts), and all writes go through the service-role key in
-- /api/admin/**.
alter table homepage_config enable row level security;
drop policy if exists "homepage_config_public_read" on homepage_config;
create policy "homepage_config_public_read" on homepage_config for select using (true);

-- Revisions are admin-only: no public policy.
alter table homepage_revisions enable row level security;
