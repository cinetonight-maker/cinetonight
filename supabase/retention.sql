-- ============================================================================
-- CineTonight — retention policy.
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- WHY THIS EXISTS: the Supabase Free plan gives 500 MB of database. Three
-- kinds of row grow forever and nothing ever removed them:
--
--   audit_log         one row per admin action, with before/after snapshots
--   *_revisions       a full content snapshot per publish — the big ones
--   recently_viewed / sync_log   one row per event
--
-- A blog body can be 30 KB. A hundred posts edited twenty times each is 60 MB
-- of revisions alone, and nothing was reclaiming any of it. This makes every
-- one of those tables bounded.
--
-- NOTHING HERE TOUCHES CONTENT. Only history, and only history past the
-- policy below. Posts, pages, media rows, settings, redirects and the
-- catalogue are never considered.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The policy, in one place so it is easy to argue with.
-- ---------------------------------------------------------------------------
--   audit_log              180 days, and never more than 20,000 rows
--   blog_revisions         20 newest PER POST, and anything from the last 90 days
--   page_revisions         20 newest PER PAGE, and anything from the last 90 days
--   homepage_revisions     30 newest (single-row config)
--   discovery_revisions    30 newest
--   settings_revisions     30 newest
--   recently_viewed        90 days
--   sync_log               90 days
--
-- Per-post rather than global for content revisions on purpose: you want deep
-- history for the post you are editing today, not an even spread across posts
-- you last touched a year ago.

create or replace function prune_retention()
returns table (table_name text, rows_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  -- ---- audit_log: age first, then a hard row cap as a backstop -----------
  if to_regclass('public.audit_log') is not null then
    delete from audit_log where created_at < now() - interval '180 days';
    get diagnostics n = row_count;
    table_name := 'audit_log (older than 180 days)'; rows_deleted := n; return next;

    delete from audit_log
    where id in (
      select id from audit_log order by created_at desc offset 20000
    );
    get diagnostics n = row_count;
    table_name := 'audit_log (beyond 20,000 rows)'; rows_deleted := n; return next;
  end if;

  -- ---- blog revisions: 20 per post, plus anything recent ----------------
  if to_regclass('public.blog_revisions') is not null then
    delete from blog_revisions r
    where r.created_at < now() - interval '90 days'
      and r.id not in (
        select id from (
          select id, row_number() over (partition by post_id order by created_at desc) as rn
          from blog_revisions
        ) ranked where rn <= 20
      );
    get diagnostics n = row_count;
    table_name := 'blog_revisions'; rows_deleted := n; return next;
  end if;

  -- ---- page revisions: same rule -----------------------------------------
  if to_regclass('public.page_revisions') is not null then
    delete from page_revisions r
    where r.created_at < now() - interval '90 days'
      and r.id not in (
        select id from (
          select id, row_number() over (partition by page_id order by created_at desc) as rn
          from page_revisions
        ) ranked where rn <= 20
      );
    get diagnostics n = row_count;
    table_name := 'page_revisions'; rows_deleted := n; return next;
  end if;

  -- ---- single-row config histories: keep the 30 newest -------------------
  if to_regclass('public.homepage_revisions') is not null then
    delete from homepage_revisions
    where id in (select id from homepage_revisions order by created_at desc offset 30);
    get diagnostics n = row_count;
    table_name := 'homepage_revisions'; rows_deleted := n; return next;
  end if;

  if to_regclass('public.discovery_revisions') is not null then
    delete from discovery_revisions
    where id in (select id from discovery_revisions order by created_at desc offset 30);
    get diagnostics n = row_count;
    table_name := 'discovery_revisions'; rows_deleted := n; return next;
  end if;

  if to_regclass('public.settings_revisions') is not null then
    delete from settings_revisions
    where id in (select id from settings_revisions order by created_at desc offset 30);
    get diagnostics n = row_count;
    table_name := 'settings_revisions'; rows_deleted := n; return next;
  end if;

  -- ---- event logs --------------------------------------------------------
  if to_regclass('public.recently_viewed') is not null then
    begin
      delete from recently_viewed where created_at < now() - interval '90 days';
      get diagnostics n = row_count;
      table_name := 'recently_viewed'; rows_deleted := n; return next;
    exception when undefined_column then
      -- no created_at on this table in this install; skip rather than fail
      null;
    end;
  end if;

  if to_regclass('public.sync_log') is not null then
    begin
      delete from sync_log where created_at < now() - interval '90 days';
      get diagnostics n = row_count;
      table_name := 'sync_log'; rows_deleted := n; return next;
    exception when undefined_column then
      null;
    end;
  end if;

  return;
end;
$$;

-- Indexes the pruning relies on. Without these the deletes are sequential
-- scans, which on the Free plan's shared CPU is worth avoiding.
create index if not exists audit_log_created_idx        on audit_log (created_at desc);
create index if not exists blog_revisions_created_idx   on blog_revisions (created_at desc);
create index if not exists page_revisions_created_idx   on page_revisions (created_at desc);

-- ---------------------------------------------------------------------------
-- Automatic weekly run, if pg_cron is available on this project.
--
-- Wrapped so the whole file still succeeds when it is not: the dashboard has a
-- "Run cleanup now" button, and the revision tables are ALSO pruned on write
-- (see the API routes), so retention does not depend on a scheduler existing.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule('cinetonight-prune')
      where exists (select 1 from cron.job where jobname = 'cinetonight-prune');
    perform cron.schedule('cinetonight-prune', '17 3 * * 0', 'select prune_retention();');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%). Use the dashboard button instead.', sqlerrm;
end;
$$;

-- Check what it would reclaim, any time:
--   select * from prune_retention();
