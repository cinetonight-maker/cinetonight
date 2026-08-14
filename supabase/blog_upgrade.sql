-- ============================================================================
-- Blog system upgrade: SEO meta fields, categories, scheduled publishing.
-- Run ONCE in Supabase Studio (SQL Editor) on the CineTonight project.
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- 1) SEO + scheduling columns on posts -------------------------------------
alter table blog_posts add column if not exists meta_title       text not null default '';
alter table blog_posts add column if not exists meta_description text not null default '';
alter table blog_posts add column if not exists publish_at       timestamptz;

-- 2) Allow the "scheduled" status ------------------------------------------
alter table blog_posts drop constraint if exists blog_posts_status_check;
alter table blog_posts add constraint blog_posts_status_check
  check (status in ('draft', 'published', 'scheduled'));

-- 3) Categories table -------------------------------------------------------
create table if not exists blog_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);
alter table blog_categories enable row level security;
drop policy if exists "public read blog_categories" on blog_categories;
create policy "public read blog_categories" on blog_categories
  for select using (true);
-- No public write policy: only the dashboard (service key) manages them.

insert into blog_categories (name) values
  ('Guides'), ('Free Movies'), ('OTT Guide'), ('How-To'), ('News'), ('Reviews')
on conflict (name) do nothing;

-- 4) Public read policy: published posts, plus scheduled posts whose
--    publish time has arrived. The site ALSO filters in its queries; this
--    keeps the database itself from ever leaking an unpublished draft.
drop policy if exists "public read published blog_posts" on blog_posts;
create policy "public read published blog_posts" on blog_posts
  for select using (
    status = 'published'
    or (status = 'scheduled' and publish_at is not null and publish_at <= now())
  );
