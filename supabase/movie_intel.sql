-- V2 Movie Intelligence — the editorial decision layer behind the V2
-- movie/series template's Tonight Verdict, Snapshot, What to Expect,
-- Best For, CineTonight Take, Tonight Profile and alternative modules.
-- (docs/V2-BUILD-PATH.md Phase 2; vocabulary and governance rules in the
-- handover package's 02_Architecture/MOVIE_INTELLIGENCE_SYSTEM.md.)
--
-- ADDITIVE AND IDEMPOTENT, like every migration in this folder: safe to
-- run repeatedly, touches nothing else. One row per title, keyed by the
-- same stable id the movies table / catalogue uses (e.g. "lanterns",
-- "tmdb-m-157336-interstellar"). NO row = the template renders its sparse
-- (Level B) state and hides every module below — that is the deliberate
-- default for the ~24k long-tail pages. A row only exists after a human
-- reviewed the title (editor + reviewed_at are NOT NULL for that reason).
--
-- Experience values are CONTROLLED VOCABULARY v1 (plain words, never
-- numbers): pace patient|steady|fast, intensity low|moderate|high,
-- attention casual|normal|focused — enforced editorially, not by CHECK
-- constraints, so vocabulary v2 can ship without a migration.

create table if not exists public.movie_intel (
  id text primary key,
  -- 5.4 The Tonight Verdict
  verdict_headline text,          -- one short original sentence
  watch_if jsonb not null default '[]'::jsonb,   -- 2-3 strings
  skip_if jsonb not null default '[]'::jsonb,    -- 1-2 strings
  chips jsonb not null default '[]'::jsonb,      -- e.g. ["Awe-inspiring","Slow build","Focused"]
  -- 5.7 experience profile (words only)
  mood text, pace text, intensity text, attention text,
  themes jsonb not null default '[]'::jsonb,
  vibe text,
  -- 5.8 What to Expect: [{"label":"Drama","value":"High","level":3}] level 1..3
  expect jsonb not null default '[]'::jsonb,
  -- 5.4/5.9 Best For
  best_for_who text, best_for_context text, best_for_caution text,
  -- 5.9 CineTonight Take (accountable editorial)
  take_title text, take_body text,
  -- 5.14 best alternative tonight (anonymous framing only)
  alt_id text,                    -- another title id in the catalogue
  alt_reasons jsonb not null default '[]'::jsonb,
  -- series-only additions (SERIES_DETAIL_PAGE.md section 5)
  episode_rhythm text,            -- episodic|serialized|hybrid
  hook_expectation text,          -- e.g. "Give it 2 episodes"
  -- governance: no row is publishable without an accountable reviewer
  editor text not null,
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Anyone may read (the site renders from this anonymously); only service
-- role writes (rows are authored from the dashboard / scripts, never by
-- visitors).
alter table public.movie_intel enable row level security;
do $$ begin
  create policy movie_intel_public_read on public.movie_intel
    for select using (true);
exception when duplicate_object then null; end $$;
