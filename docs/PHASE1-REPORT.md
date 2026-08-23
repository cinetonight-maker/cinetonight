# Phase 1 — Cloudflare usage stabilization: final report

**Date:** 18 August 2026. Phase 1 work was implemented incrementally across this
period and deployed earlier today; this document is the consolidated audit
required by the Phase 1 brief, plus the last two gaps it surfaced (both closed).

---

## 1. Current cache architecture (traced, not assumed)

Request path for a cacheable page:

```
Visitor / bot
  → Cloudflare edge (Cache-Control headers; absorbs repeats on browse pages,
    sitemap/rss/robots, /api/mood, /api/browse, /api/title, static art)
  → Worker (OpenNext 1.20.2)
      → enableCacheInterception: cached pages answered before Next.js boots
      → regional cache (withRegionalCache, mode: "long-lived",
        shouldLazilyUpdateOnCacheHit: false) — absorbs repeat reads per region
      → R2 incremental cache (bucket cinetonight-cache, prefix incremental-cache/,
        binding NEXT_INC_CACHE_R2_BUCKET) — the durable lower layer
          → holds BOTH: ISR page entries (per route) AND data-cache entries
            (one per unique server fetch() URL: TMDB + Supabase)
  → upstream (TMDB / Supabase) only on true miss or expiry
Revalidation: Durable Object queue (DOQueueHandler) wrapped in queueCache
(regionalCacheTtlSec: 5) → one stale entry + N concurrent requests =
ONE regeneration and ONE R2 write (dedup verified in config).
```

- Tag cache: **deliberately none** (no revalidateTag/revalidatePath anywhere) —
  a D1/DO tag cache is more infrastructure than the site needs; a deploy busts
  everything anyway because the cache key includes `OPEN_NEXT_BUILD_ID`.
- Direct R2 access in app code: **none** (verified — no put/get/list/delete
  outside OpenNext itself).
- Deploys do **not** prewarm or populate R2 (the one-time `populateCache` run
  during the original migration was exactly that — one-time).

## 2. Where Class A writes come from, and what was fixed

Class A = every write of a page entry or data-cache entry. The three historical
drivers, in order of severity, all fixed earlier in this phase:

1. **A 60-second revalidate ceiling on every route.** `lib/supabase/public.ts`
   wrapped all anonymous Supabase reads in `revalidate: 60`; Next takes the
   minimum of route + fetch revalidates, and the root layout reads settings
   through that client — so `/movie/[id]`'s configured 3-day TTL was actually
   60 seconds. The whole route table was rewriting once a minute under crawl.
   Now 1800s; build-table Revalidate column verified (15m homepage, 30m rest).
2. **Millisecond timestamps in Supabase query URLs** (blog list + blog detail)
   — every render was a unique data-cache key: guaranteed miss + write +
   orphan, forever. Time filter moved into JS; URLs now stable.
3. **Unbounded spray surfaces.** `/[slug]` (root catch-all) was ISR — any
   random URL minted a page entry + a per-slug query entry. Now force-dynamic
   with a membership check against ONE cached slug-list query. `/blog/[slug]`
   got the same membership guard. `/search` (unbounded ?q= SSR + live TMDB
   call) is now robots-disallowed for all crawlers.

Also active from earlier rounds: tiered TMDB TTLs (stable 72h / steady 24h /
fresh 6h / search no-store), per-isolate request memo, homepage reduced to ONE
TMDB call, closed clamped parameter sets on /api/mood and /api/browse, edge
cache headers on everything bots hammer, sitemap capped at ~150 live-TMDB URLs
with honest lastModified, AI-crawler and SEO-tool bot rules in robots.txt, WAF
rate rules in the dashboard.

## 3. Pagination — the five-page rule (brief §12–15)

- `MAX_BROWSE_PAGE = 5` lives in `lib/tmdb.ts`, re-exported via `lib/browse.ts`.
- **Server enforcement:** `getBrowsePage()` clamps before ANY fetch; every
  TMDB browse path caps `totalPages` at 5, so the UI cannot even render a
  link to page 6; the local fallback now caps too (fixed today).
- **Hard 404 (added today):** `/api/browse?page=6`…`page=999999` now returns
  404 **before any fetch** via `isBrowsePageSupported()`. Malformed values
  (`abc`, `-1`, `0`) coerce to page 1 — one cheap, edge-cached response, no
  amplification.
- **Listing PAGE routes** (`/movies` etc.) never read `?page` server-side at
  all — pagination is client state calling the clamped API. So
  `/movies?page=37` performs only page-1 work (already cached), links nowhere,
  appears in no sitemap, and carries a page-less canonical. This is the
  "technically justified response" the brief allows: the param is inert, so
  there is nothing expensive to reject.
- Tested: pages 1/5 valid; 6/50/999999/-1/abc all safe (matrix below).

## 4. Search and filters (brief §17–18)

- Search API: TMDB fetches are `no-store` — arbitrary queries create **zero**
  R2 inventory. Search SSR page: force-dynamic (no page-cache writes), now
  crawler-blocked. Long-tail access is fully preserved: search, direct title
  URLs, and the recommendation rails all still reach the entire catalogue.
- Filters: `/api/mood` clamps every numeric to an allow-list and kind to
  movie/series; genre resolves against a fixed map; sort against a fixed list;
  page ≤ 5. No open combination can mint unbounded cache keys.

## 5. generateStaticParams (brief §20)

Movie: ~18 curated titles. Blog: real posts. Free-movies: ~19 classics.
Person: **removed** (force-dynamic). Nothing pre-generates the TMDB catalogue.

## 6. Cache-key stability (brief §11)

Repo-wide sweep: no `Date.now()`/`Math.random()`/UUIDs/session values in any
cached fetch URL. Randomness exists ONLY client-side (pick shuffling). The one
date remaining in discover URLs is **day**-precision (one new key set per day,
by design). Verified again today.

## 7. Middleware (brief §23)

Matcher excludes static assets and all hot anonymous APIs (watch, search,
browse, title, tv, trailer, mood). No middleware added for pagination.

## 8. Changes in THIS final pass (the only code deltas today for Phase 1)

| File | Change |
|---|---|
| `lib/browse.ts` | local-fallback `totalPages` now capped at `MAX_BROWSE_PAGE` |
| `app/api/browse/route.ts` | page > 5 → **404 before any fetch** |

Everything else in this report was already in place and is **preserved**, per
brief §6. No rollbacks.

## 9. Test matrix (local production build, today)

`/`, `/movies`, `/movies?page=5|6|50`, `/trending`, `/latest`, `/web-series`,
`/tv-shows`, `/genres`, `/movies?genre=Drama`, long-tail search, `/blog`,
`/my-list` → all correct. API: page 1/5 → 200; page 6/999999 → **404**;
page -1/abc → coerced to 1. tsc clean, production build clean, OpenNext build
clean. (TMDB/Supabase unreachable from this sandbox — cost behaviour §34 is
verified by code path + must be confirmed by production metrics.)

## 10. Expected metric behaviour

- **Class A:** the 60s-ceiling fix alone removes the per-minute rewrite of the
  entire route table; the timestamp fix removes a write per render of any
  blog-reading page; spray surfaces no longer write at all. This is the path
  from 253K/day toward the sub-30K target. Steady-state writers that REMAIN by
  design: expiries of real pages/data at their tiered TTLs + first-visits of
  uncached live-TMDB titles.
- **Class B:** stays modest; regional cache + interception absorb most reads;
  edge headers cut Worker traffic (and therefore R2 reads) on bot-heavy paths.
- **Storage:** near-flat — writers are bounded; orphan creation stopped.
  A deploy still orphans one cache generation (build-ID key) — batch deploys.
- **CPU/requests:** slightly DOWN (dead Vercel-script 404s removed two Worker
  invocations per pageview; edge absorbs more).

## 11. SEO safety

All listing/detail/blog/classics pages remain SSR with full metadata. Homepage
and browse pages are crawlable; only `/search` and auth/api surfaces are
blocked. Canonicals unchanged. The soft-404 framework limitation (junk URLs
return HTTP 200 with a noindex 404 page) is unchanged — re-verify on
production when convenient.

## 12. Functional risks

- `/api/browse` 404s beyond page 5 — the UI can't request those, but any
  bookmarked deep-page API call (none should exist) now 404s.
- The regional cache means a just-revalidated page can be seen stale for up
  to its regional TTL in another region — inherent to long-lived mode.

## 13. What to verify in Cloudflare (using TODAY's deploy timestamp)

At ~6h, ~12h, and one clean 24h window after the deployment timestamp:
R2 Class A (target trajectory: green < 30K/day), Class B, bucket size and
object count (should flatten), Worker requests/CPU/errors, cache hit rate
(should stay ~98%). Judge ONLY windows fully after the deploy timestamp.

## 14. Cleanup plan for the ~221 GB (brief §27 — NOT executed)

After TWO clean days of green Class A: one-time removal of the previous
build-ID generations under `incremental-cache/` (everything not matching the
current `OPEN_NEXT_BUILD_ID`), then a 14-day age lifecycle rule on the prefix
as a safety net — long enough that healthy TTL churn never collides with it.
Requires your explicit go-ahead; nothing automatic.
