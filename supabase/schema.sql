-- CineTonight admin dashboard schema
-- Run this once in Supabase → SQL Editor (your project → SQL Editor → New query → paste → Run).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / OR REPLACE.

-- ============================================================= pages ======
-- Custom static pages (About, Contact, DMCA, Terms, Privacy, ...) editable
-- from the dashboard and rendered at /p/<slug>.
create table if not exists pages (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  content     text not null default '',
  status      text not null default 'draft' check (status in ('draft', 'published')),
  updated_at  timestamptz not null default now()
);

-- ========================================================== nav_links =====
-- Footer / menu links. `location` groups them into the columns the Footer
-- component renders (see components/Footer.tsx).
create table if not exists nav_links (
  id          uuid primary key default gen_random_uuid(),
  location    text not null check (location in ('footer_explore', 'footer_support', 'footer_legal', 'header')),
  label       text not null,
  url         text not null,
  sort_order  integer not null default 0,
  is_external boolean not null default false
);

-- =========================================================== comments =====
-- Visitor comments on titles. Public can submit (via /api/comments, always
-- forced to status='pending' server-side); only approved ones are public.
create table if not exists comments (
  id          uuid primary key default gen_random_uuid(),
  movie_id    text not null,
  name        text not null,
  body        text not null,
  rating      integer check (rating between 1 and 5),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz not null default now()
);
create index if not exists comments_movie_id_idx on comments (movie_id);

-- ============================================================== media =====
-- Metadata for files uploaded to the "media" storage bucket.
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  path        text not null,
  url         text not null,
  size        bigint,
  mime_type   text,
  created_at  timestamptz not null default now()
);

-- =============================================================== movies ====
-- The full catalogue — replaces content/movies.json. `id` stays the same
-- human slug used everywhere already (e.g. "stree-2"), so URLs don't change.
-- poster_url/backdrop_url are optional custom uploads (Media Library) that
-- override the TMDB-sourced poster_path/backdrop_path when set.
create table if not exists movies (
  id            text primary key,
  tmdb_id       bigint,
  title         text not null,
  year          integer not null default 0,
  genres        jsonb not null default '[]'::jsonb,
  kind          text not null default 'movie' check (kind in ('movie', 'series')),
  rating        numeric not null default 0,
  votes         integer,
  runtime       text not null default '',
  cert          text not null default '',
  language      text not null default '',
  director      text not null default '',
  writers       text not null default '',
  cast_list     jsonb not null default '[]'::jsonb,
  description   text not null default '',
  poster_path   text,
  backdrop_path text,
  poster_url    text,
  backdrop_url  text,
  trailer_key   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists movies_kind_idx on movies (kind);

-- ========================================================= home_config ====
-- Single-row table: hero slides, home-row rules, and continue-watching —
-- the same shape the dashboard's Hero/Rows tabs already edit, just backed
-- by Supabase instead of content/site.json.
create table if not exists home_config (
  id                integer primary key default 1 check (id = 1),
  hero_slides       jsonb not null default '[]'::jsonb,
  hero_interval_ms  integer not null default 6000,
  rows              jsonb not null default '[]'::jsonb,
  continue_watching jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);
insert into home_config (id) values (1) on conflict (id) do nothing;

-- ========================================================== blog_posts ====
-- Replaces the "blog" array inside site.json. body is an array of paragraph
-- strings (same shape the dashboard's blog editor already produces).
create table if not exists blog_posts (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  cat         text not null default 'Guide',
  excerpt     text not null default '',
  body        jsonb not null default '[]'::jsonb,
  image_url   text,
  date_label  text not null default '',
  read_label  text not null default '5 min',
  status      text not null default 'published' check (status in ('draft', 'published')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ========================================================= admin_users ====
-- Allowlist of accounts that may use the dashboard. Every Supabase Auth user
-- can *sign in*, but middleware.ts only grants /admin + /api/admin/** access
-- to user_ids present here — this is what stops a future public /signin or
-- /signup flow (see app/signin, app/signup) from doubling as an admin
-- backdoor. Add an admin with, e.g.:
--   insert into admin_users (user_id, email)
--   select id, email from auth.users where email = 'you@example.com';
create table if not exists admin_users (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  email       text,
  created_at  timestamptz not null default now()
);
alter table admin_users enable row level security;
-- A signed-in user may only read THEIR OWN row (to check "am I an admin?").
-- No insert/update/delete policy exists for anon/authenticated roles, so the
-- allowlist can only be managed from the SQL editor or the service-role key
-- — matching how /admin/login has no self-serve signup either.
drop policy if exists "self read admin_users" on admin_users;
create policy "self read admin_users" on admin_users
  for select using (auth.uid() = user_id);

-- =========================================================== watchlist ====
-- Real per-account "My List", for signed-in visitors (see lib/watchlist.ts).
-- Anonymous visitors still get the original localStorage-only watchlist —
-- this table only comes into play once someone has a real account, at
-- which point their local list is merged in once on first sign-in.
create table if not exists watchlist (
  user_id     uuid not null references auth.users (id) on delete cascade,
  movie_id    text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, movie_id)
);
alter table watchlist enable row level security;
drop policy if exists "own watchlist" on watchlist;
create policy "own watchlist" on watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ====================================================== recently_viewed ===
-- Powers the real "Continue Watching" row for signed-in visitors — this
-- site doesn't host playback, so there's no real "progress %" to track;
-- what's genuinely knowable is which title pages someone actually opened,
-- most-recent first. (Signed-out visitors keep seeing the existing
-- admin-curated Continue Watching row — see app/page.tsx.)
create table if not exists recently_viewed (
  user_id     uuid not null references auth.users (id) on delete cascade,
  movie_id    text not null,
  viewed_at   timestamptz not null default now(),
  primary key (user_id, movie_id)
);
alter table recently_viewed enable row level security;
drop policy if exists "own recently_viewed" on recently_viewed;
create policy "own recently_viewed" on recently_viewed
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================== bot_state ====
-- Single-row watermark for the Telegram auto-poster (see
-- app/api/cron/telegram-digest/route.ts) — remembers the newest movie/blog
-- post it has already announced, so a daily cron run only posts genuinely
-- new items instead of re-posting the whole catalogue every time. Same
-- singleton-row pattern as site_settings.
create table if not exists bot_state (
  id                     integer primary key default 1 check (id = 1),
  last_movie_posted_at   timestamptz not null default now(),
  last_blog_posted_at    timestamptz not null default now()
);
insert into bot_state (id) values (1) on conflict (id) do nothing;
-- No RLS needed: never read from the public site, only from the cron route
-- via the service-role key.

-- ========================================================= subscribers ====
-- Newsletter signups from the "Never miss a premiere" sidebar widget
-- (components/NewsletterForm.tsx → POST /api/subscribers). The form was
-- previously a dead <button> with no handler at all — every email typed
-- into it just vanished. Insert-only from the site's perspective: the
-- public API route always writes through the service-role key, so no
-- public insert/select policy is needed here, same as admin_users.
create table if not exists subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  status      text not null default 'active' check (status in ('active', 'unsubscribed')),
  created_at  timestamptz not null default now()
);
alter table subscribers enable row level security;
-- No policies: table is fully private, reachable only via the service-role
-- key (the /api/subscribers route handler, or the SQL editor/dashboard).

-- ======================================================= site_settings ====
-- Single-row table: global SEO / contact / social settings.
create table if not exists site_settings (
  id               integer primary key default 1 check (id = 1),
  site_title       text not null default 'CineTonight',
  site_description text not null default 'Stream the latest movies and web series in HD.',
  meta_keywords    text not null default '',
  contact_email    text not null default '',
  social           jsonb not null default '{}'::jsonb,
  maintenance_mode boolean not null default false,
  updated_at       timestamptz not null default now()
);
insert into site_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================== RLS =======
-- The dashboard (server, using the SECRET key) bypasses RLS entirely — these
-- policies only govern what the PUBLIC/anon key (used by the live site) can
-- see. Nothing here grants public write access to pages/nav/media/settings;
-- writes only ever happen through the authenticated /api/admin/** routes.

alter table pages          enable row level security;
alter table nav_links      enable row level security;
alter table comments       enable row level security;
alter table media          enable row level security;
alter table site_settings  enable row level security;
alter table movies         enable row level security;
alter table home_config    enable row level security;
alter table blog_posts     enable row level security;

drop policy if exists "public read published pages" on pages;
create policy "public read published pages" on pages
  for select using (status = 'published');

drop policy if exists "public read movies" on movies;
create policy "public read movies" on movies
  for select using (true);

drop policy if exists "public read home_config" on home_config;
create policy "public read home_config" on home_config
  for select using (true);

drop policy if exists "public read published blog_posts" on blog_posts;
create policy "public read published blog_posts" on blog_posts
  for select using (status = 'published');

drop policy if exists "public read nav links" on nav_links;
create policy "public read nav links" on nav_links
  for select using (true);

drop policy if exists "public read approved comments" on comments;
create policy "public read approved comments" on comments
  for select using (status = 'approved');

drop policy if exists "public read site settings" on site_settings;
create policy "public read site settings" on site_settings
  for select using (true);

-- media table has no public policy — the dashboard alone lists uploads;
-- the files themselves are served from the public storage bucket below.

-- =========================================================== storage ======
insert into storage.buckets (id, name, public)
  values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists "public read media bucket" on storage.objects;
create policy "public read media bucket" on storage.objects
  for select using (bucket_id = 'media');
-- Uploads/deletes to this bucket happen only through the admin API routes
-- using the SECRET key, which bypasses storage RLS — no public write policy
-- is needed or created.
