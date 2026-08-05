-- MOVIEX admin dashboard schema
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

-- ======================================================= site_settings ====
-- Single-row table: global SEO / contact / social settings.
create table if not exists site_settings (
  id               integer primary key default 1 check (id = 1),
  site_title       text not null default 'MOVIEX',
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

drop policy if exists "public read published pages" on pages;
create policy "public read published pages" on pages
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
