-- ============================================================================
-- Sync Center upgrade: hero auto/manual mode + sync history log.
-- Run ONCE in Supabase Studio (SQL Editor) on the CineTonight project.
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- 1) Hero mode: 'auto' lets the daily sync rotate the hero to trending
--    titles; 'manual' locks it to the editor's picks (sync never touches it).
alter table home_config add column if not exists hero_mode text not null default 'auto';
alter table home_config drop constraint if exists home_config_hero_mode_check;
alter table home_config add constraint home_config_hero_mode_check
  check (hero_mode in ('auto', 'manual'));

-- 2) Sync history: one row per sync run (cron or dashboard button), so the
--    dashboard can show "last synced X minutes ago" and what changed.
create table if not exists sync_log (
  id          bigint generated always as identity primary key,
  trigger     text not null check (trigger in ('cron', 'manual')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean not null default true,
  added       jsonb not null default '[]'::jsonb,
  refreshed   integer not null default 0,
  hero_slides jsonb not null default '[]'::jsonb,
  errors      jsonb not null default '[]'::jsonb
);
alter table sync_log enable row level security;
-- No public policies on purpose: only the dashboard and cron APIs (service
-- key, which bypasses RLS) can read or write sync history.
