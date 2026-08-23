-- ============================================================================
-- CineTonight CMS — blog SEO fields (Phase 4B-4, blog half).
-- Run once in Supabase → SQL Editor. Safe to re-run (idempotent).
--
-- Additive only. Every column is nullable or has a default, so the site works
-- exactly the same before and after this runs — the dashboard hides the fields
-- it cannot find and says why (System Health lists what is still outstanding).
--
-- WHY THESE FIVE: they are the fields the house publishing guidelines ask for
-- that the editor could not store. Without them, an SEO-ready article needs a
-- code change, which is the exact thing this dashboard exists to remove.
-- ============================================================================

-- 1. Focus keyword ------------------------------------------------------------
-- The ONE phrase the article should rank for. The editor's publish checklist
-- measures the title, description, URL, opening paragraph and H2s against it.
alter table blog_posts add column if not exists focus_keyword text;

-- 2. Secondary keywords -------------------------------------------------------
-- Supporting phrases, for the writer's reference and for the article's own
-- keyword meta tag. NOT used to stuff anything: they are a planning aid.
alter table blog_posts add column if not exists secondary_keywords text[] default '{}';

-- 3. Canonical override -------------------------------------------------------
-- Blank = the article is its own canonical (correct for almost every post).
-- Set it ONLY when this article is a republished copy of something that lives
-- elsewhere. Pointing it at another URL usually removes this page from search
-- results, which is why the editor confirms before saving a value here.
alter table blog_posts add column if not exists canonical_url text;

-- 4. Social share image -------------------------------------------------------
-- Falls back to the featured image when blank. Separate because the ideal
-- crop for a 1200x630 social card is rarely the ideal crop for a blog card.
alter table blog_posts add column if not exists og_image text;

-- 5. Hide from search ---------------------------------------------------------
-- Per-article noindex. Default FALSE so nothing already published changes
-- behaviour. Useful for thin landing pages, seasonal duplicates, and drafts
-- that must be publicly readable but should not be indexed.
alter table blog_posts add column if not exists noindex boolean not null default false;

-- 6. Carry the same fields into version history -------------------------------
-- A revision that cannot restore the SEO fields is not a restore point.
alter table blog_revisions add column if not exists focus_keyword text;
alter table blog_revisions add column if not exists secondary_keywords text[];
alter table blog_revisions add column if not exists canonical_url text;
alter table blog_revisions add column if not exists og_image text;
alter table blog_revisions add column if not exists noindex boolean;

-- 7. Index for the dashboard's keyword search ---------------------------------
create index if not exists blog_posts_focus_keyword_idx on blog_posts (focus_keyword);
