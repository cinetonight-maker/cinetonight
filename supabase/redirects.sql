-- ============================================================================
-- CineTonight CMS — Redirect Manager (Phase 4B-3).
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Additive only: one new table, nothing existing is touched. Until this runs,
-- the Redirects screen says so and the public site behaves exactly as it does
-- today — the lookup fails open to a normal 404.
-- ============================================================================

create table if not exists redirects (
  id          uuid primary key default gen_random_uuid(),

  -- Normalised by lib/redirects.ts before it ever reaches here: leading slash,
  -- lowercase, no trailing slash, no query, no fragment. UNIQUE so one address
  -- can never have two conflicting rules.
  from_path   text        not null unique,

  -- Internal paths only. An external destination hands your traffic and your
  -- ranking to someone else's domain, so it is refused at the API, not here.
  --
  -- ALWAYS THE FINAL DESTINATION. If A→B is saved while B→C exists, what is
  -- stored is A→C, and any rule pointing at A is rewritten in the same call.
  -- "One hop" is therefore a property of this table, not something the request
  -- path has to compute — see planRuleWrite in lib/redirects.ts.
  to_path     text        not null,

  -- 307/302 temporary, 308/301 permanent. New rules default to 307 ON PURPOSE:
  -- a permanent redirect is cached by browsers and outlives deleting the row,
  -- so promoting one is a deliberate act after checking the destination.
  status      smallint    not null default 307 check (status in (301, 302, 307, 308)),

  -- FALSE by default. A rule cannot affect the live site until someone has
  -- looked at it — this is the "preview before publishing" contract, enforced
  -- in the schema rather than in the UI, which is also what makes a careless
  -- bulk import harmless.
  enabled     boolean     not null default false,

  -- Why this redirect exists. Closed set, mirrored by REDIRECT_REASONS in
  -- lib/redirects.ts so the two cannot drift. Two of these are set
  -- automatically: a slug rename writes 'slug_change', a bulk import writes
  -- 'migration'.
  reason      text        not null default 'other'
              check (reason in ('slug_change', 'content_merge', 'duplicate_removal',
                                'migration', 'seo_cleanup', 'other')),

  note        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The public lookup selects only enabled rules, so this is the index that
-- matters. It is one query for the whole set, cached and tagged `cms:redirects`
-- — never one query per requested path.
create index if not exists redirects_enabled_idx on redirects (enabled);

-- Admin-only data. All access goes through the service-role key in
-- /api/admin/redirects (which bypasses RLS) and the public read uses the
-- anon key, so a SELECT policy for enabled rows is required for the site
-- itself to resolve them.
alter table redirects enable row level security;

drop policy if exists "public reads enabled redirects" on redirects;
create policy "public reads enabled redirects"
  on redirects for select
  using (enabled = true);
