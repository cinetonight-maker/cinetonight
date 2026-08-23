-- ============================================================================
-- D1 tag cache — the table OpenNext expects but never created for us.
--
-- WHY THIS FILE EXISTS
--
-- `opennextjs-cloudflare deploy` creates this table automatically, but ONLY
-- when it recognises the tag cache in open-next.config.ts by name. Our config
-- wraps the D1 tag cache in `withFilter(...)`, and withFilter renames it from
-- "d1-next-mode-tag-cache" to "filtered-d1-next-mode-tag-cache". The deploy
-- step matches on the exact original name, does not recognise the wrapped one,
-- and prints "Tag cache does not need populating" before skipping the table
-- creation entirely.
--
-- The result is silent. Every read path in the D1 tag cache
-- (hasBeenRevalidated, isStale, getLastRevalidated) catches its own errors and
-- returns "not revalidated" on failure. So a missing table does not throw
-- anywhere a person would see it. It simply means every publish is ignored and
-- pages sit until their TTL expires, which is exactly the behaviour the tag
-- cache was added to remove.
--
-- HOW TO RUN IT (once, from the project root):
--
--   npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --file=./d1/tag-cache-init.sql
--
-- Safe to re-run. CREATE TABLE IF NOT EXISTS does nothing when the table is
-- already there.
--
-- The table survives deployments, so this is a one-time fix, not a deploy step.
-- Re-run it only if the D1 database itself is ever recreated.
--
-- Column meanings, from the adapter:
--   tag           the cache tag, prefixed with the build id
--   revalidatedAt when the tag was last marked stale (ms since epoch)
--   stale         start of the stale-while-revalidate window (added in v1.19)
--   expire        hard expiry, NULL for none (added in v1.19)
-- ============================================================================

CREATE TABLE IF NOT EXISTS revalidations (
  tag           TEXT    NOT NULL,
  revalidatedAt INTEGER NOT NULL,
  stale         INTEGER,
  expire        INTEGER DEFAULT NULL,
  UNIQUE(tag) ON CONFLICT REPLACE
);
