-- ============================================================================
-- CineTonight CMS — Stage 6: Discovery Manager.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- This is the CONFIGURATION MANAGER pattern from docs/CMS-DESIGN-RULES.md:
-- one row holding BOTH the live version and the draft version, plus a
-- revisions table. The public discovery reads `live_config` only, which is the
-- same structural guarantee that makes blog drafts safe — editing the draft
-- cannot change the site, whatever else goes wrong.
--
-- Nothing here is destructive. lib/moods.ts and lib/quickPicks.ts remain the
-- source of the IDS and the RULES; this table only decorates and orders them.
-- ============================================================================

create table if not exists discovery_config (
  id           int primary key default 1,
  live_config  jsonb,          -- what visitors see. NULL = the shipped default.
  draft_config jsonb,          -- your edits. Invisible to visitors, always.
  draft_saved_at timestamptz,
  published_at   timestamptz,
  published_by   text,
  constraint discovery_config_single_row check (id = 1)
);

insert into discovery_config (id) values (1) on conflict (id) do nothing;

-- Every publish snapshots the version it replaced, so any discovery you have
-- ever had can be restored. Rolling back writes a new revision rather than
-- deleting one, so a rollback is itself undoable.
create table if not exists discovery_revisions (
  id         uuid primary key default gen_random_uuid(),
  config     jsonb not null,
  note       text,
  author     text,
  created_at timestamptz not null default now()
);

create index if not exists discovery_revisions_time_idx on discovery_revisions (created_at desc);

-- The discovery config is PUBLIC-READ on purpose: the homepage and /discover
-- render from it.
-- Only `live_config` is exposed; the draft is never selected by public code
-- (see lib/discovery.ts), and all writes go through the service-role key in
-- /api/admin/**.
alter table discovery_config enable row level security;
drop policy if exists "discovery_config_public_read" on discovery_config;
create policy "discovery_config_public_read" on discovery_config for select using (true);

-- Revisions are admin-only: no public policy.
alter table discovery_revisions enable row level security;
