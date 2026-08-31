-- Per-post author attribution.
--
-- Additive and idempotent, like every other migration in this folder. Until
-- it is run the app behaves exactly as before: app/api/admin/blog/route.ts
-- detects the missing column and retries the write without it, and every post
-- falls back to DEFAULT_AUTHOR_SLUG in lib/authors.ts.
--
-- Stores the author SLUG (e.g. 'syed-ahmad'), not a display name, so renaming
-- a person in lib/authors.ts never orphans existing rows.
--
-- DELIBERATELY NOT ADDED TO blog_revisions. That table already has an
-- `author` column (supabase/blog_cms.sql) meaning "the admin who saved this
-- revision", which is a different thing entirely. Reusing the name there
-- would leave two incompatible meanings behind one column. Revision restore
-- copies content fields only and never touches post authorship, so nothing
-- is lost by leaving it out.

alter table if exists blog_posts
  add column if not exists author text;
