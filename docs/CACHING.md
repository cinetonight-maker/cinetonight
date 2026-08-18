# CineTonight caching and Cloudflare cost model

Read this before changing any `revalidate` value, adding a `fetch()` to a
server component, or adding a new dynamic route. In August 2026 a well
intentioned caching setup produced **2.79 million R2 objects, 211 GB of
storage and roughly 1 million R2 write operations a day**, projecting to
about $70/month on a $5 plan. This file exists so that never happens twice.

## The one thing to understand

On Cloudflare, Next.js's caches do not live on a disk. They live in the R2
bucket `cinetonight-cache` under `incremental-cache/`. R2 bills **per
operation**, and writes (Class A) cost roughly ten times reads (Class B).

Two separate things write there:

| What | Created by | One object per |
| --- | --- | --- |
| **Page cache** | `export const revalidate` on a route (ISR) | rendered URL |
| **Data cache** | `fetch(..., { next: { revalidate } })` | unique request URL |

So a single movie page view can create several objects: the rendered page,
plus one per TMDB URL it fetched. Every time a TTL lapses and the URL is
requested again, those objects are **rewritten** - another write operation.

## What went wrong

1. **An unbounded URL space was being persisted.** `/movie/[id]` and
   `/person/[id]` accept any `tmdb-m-*` / `tmdb-p-*` id, so the addressable
   space was TMDB's entire database: ~1M titles and ~4.5M people. Every movie
   page links ~10 cast members; every person page links their whole
   filmography, which links more cast. That is a self-expanding graph, and
   with ISM on both routes, **every URL a crawler invented became a permanent
   R2 object**. AI crawlers were making ~350k requests/day at the time.

2. **One flat TTL for every kind of data.** All TMDB responses were cached for
   6 hours, so a 2013 film's cast list - which never changes - was rewritten
   up to four times a day, forever, exactly like today's trending list.

3. **Short page revalidate windows on the long tail.** Movie pages
   revalidated every 10 minutes across thousands of URLs.

4. **Unresolvable URLs returned HTTP 200** (soft 404), so junk ids were
   cached as if they were real pages.

## The rules now

**Page caching (`revalidate`)**

- Long tail, unbounded id space, low search value → **no ISR**. Use
  `export const dynamic = "force-dynamic"` and let the Cloudflare CDN absorb
  repeats via the `Cache-Control` headers in `next.config.mjs`. This is what
  `/person/[id]` does. Still fully server rendered, so SEO is unaffected.
- High value pages with a bounded-ish set (`/movie/[id]`) → ISR, but with a
  **long** window. Movie metadata does not change hourly.
- Editorially updated pages (home, blog) → short enough to feel live
  (10-15 min). There is exactly one homepage, so its cost is trivial.
- Per user or per query (`/account`, `/my-list`, `/search`, all `/api/*`) →
  `force-dynamic`, never cached. Verified: these send
  `Cache-Control: private, no-store`, so no signed-in HTML can ever be
  served to another visitor from a shared cache.

Current values (see each route file):

| Route | Mode | Window |
| --- | --- | --- |
| `/` | ISR | 15 min |
| `/blog`, `/blog/[slug]` | ISR | 10 / 30 min |
| `/movie/[id]` | ISR | 3 days (matches its data TTL) |
| `/person/[id]` | dynamic | CDN only, 24 h s-maxage |
| `/free-movies`, `/genres`, `/faq`, `/follow`, `/[slug]` | ISR | 24 h |
| `/search`, `/my-list`, `/account`, `/api/*`, `/admin` | dynamic | never |

**Data caching (TMDB)**

`lib/tmdb.ts` sets TTL by how volatile the data actually is:

- `stable` (3 days) - title/person detail, credits, images. History.
- `steady` (1 day) - discover, genre and language lists, watch providers.
- `fresh` (6 h) - trending, now playing, on the air, popular, upcoming.
- `search` (1 h) - free-text search, which mints many one-off keys.

There is also a small per-isolate memo (60 s) that collapses identical calls
inside one render. This matters more than it looks: several routes resolve the
same data twice, once in `generateMetadata` and once in the page body.

## Rules for adding new code

- Adding a server `fetch()`? Give it a TTL from the table above. Never leave
  a volatile default on stable data.
- Adding a dynamic route whose parameter comes from an external id? Assume
  crawlers will enumerate it. Either bound it or make it `force-dynamic`.
- Never put a timestamp, random value, session value or unbounded search term
  into a cached request URL: each variation is a new permanent object.
- If a page cannot resolve its record, it must not be indexable
  (`NOT_FOUND_META` in the route files).
- Never add a public `Cache-Control` header to anything user specific.

## R2 lifecycle

`incremental-cache/` should have a lifecycle rule deleting objects older than
**14 days**. That is comfortably longer than the longest TTL in use (3 days),
so nothing live is ever deleted, while abandoned entries - build ids from old
deploys, pages nobody visits any more - stop accumulating. Do not set it much
shorter: deleting entries that are still in use forces regeneration, which
costs *more* writes than the storage saved.

## Revalidation de-duplication (round 2)

The first fix cut R2 writes from ~972k/day to ~253k/day, but the remaining
writes had a multiplier we had missed: the memory queue de-duplicated
regeneration **per isolate**. Cloudflare runs hundreds of locations, each with
its own isolate, and each independently noticed the same page was stale and
regenerated it. One expired page became many identical R2 writes.

`open-next.config.ts` now uses `queueCache(doQueue)`:

- `doQueue` routes every revalidation through a single Durable Object, so a
  stale page regenerates **once globally**.
- `queueCache` adds a 5-second regional cache in front of it, so repeat
  triggers inside one region are dropped before they reach the DO - which also
  keeps DO requests inside the included allowance.

This needs the `NEXT_CACHE_DO_QUEUE` binding and the `DOQueueHandler`
migration in `wrangler.jsonc`. Do not remove them.

## Browse depth

`MAX_BROWSE_PAGE = 5` in `lib/tmdb.ts` is the public browse limit, enforced
**server-side** in `getBrowsePage()` - not just hidden in the UI. Every
(kind, sort, genre, page) combination is its own TMDB request and its own
persisted cache entry, so 50 pages multiplied the cache surface tenfold for
pages almost nobody reached.

The catalogue itself is untouched: search queries TMDB directly, and every
title page works by direct URL whether or not it appears in a browse page.
**Small browse surface, large searchable catalogue.**

## Unbounded key spaces

Free-text search passes `{ noStore: true }` to `get()`, so arbitrary queries
never become persisted R2 objects. Any future feature with an unbounded key
space (user input, arbitrary filters) must do the same.

## Monitoring

Cloudflare → R2 → `cinetonight-cache` → Metrics. The number to watch is
**Class A operations per day**. Operational thresholds:

| Band | Class A / day | Action |
| --- | --- | --- |
| Green | under 30k | healthy |
| Yellow | 30k-75k | review what shipped recently |
| Orange | 75k-150k | investigate promptly |
| Red | over 150k | treat as a cost incident |

If it climbs back up, something new is writing per request: look for a newly
added short `revalidate`, a new unbounded dynamic route, or a fetch whose URL
varies per request.

Judge a change only on a CLEAN window. A "last 24 hours" view straight after a
deploy mixes old and new behaviour - record the deploy time and compare at 6h
and 24h past it.

---

## The 60-second ceiling (found 18 Aug 2026)

`lib/supabase/public.ts` wrapped every anonymous Supabase read in
`fetch(..., { next: { revalidate: 60 } })`. That looked local, but it was not.

Next sets a route's effective revalidate to the **minimum** of its segment
`export const revalidate` and every `fetch()` inside it. The root layout calls
`getSiteSettings()` through that client, so **every page on the site inherited a
60-second revalidate**, silently overriding every longer TTL we had configured:

| Route | Configured | Actually was |
|---|---|---|
| `/` | 900s | 60s |
| `/movie/[id]` | 259200s (3 days) | 60s |
| `/free-movies/*`, `/genres`, `/faq`, … | ISR | 60s |

Every expiry is a re-render, and every re-render is an R2 **Class A write**. At
60 seconds, a crawler walking the site kept the entire route table rewriting
once a minute. This was almost certainly a large share of the Class A volume
that survived the round-1 and round-2 fixes.

The value is now **1800s (30 minutes)**. Effective revalidate after the change:
`/` 15m, `/blog` 10m, everything else 30m.

### How to check this yourself

Run `npm run build` and read the **Revalidate** column of the route table. If a
route shows a shorter time than its `export const revalidate`, something inside
it is fetching with a shorter window. That column is the source of truth — the
export is only a request.

### Why there is no `revalidateTag()`

On Cloudflare, `revalidateTag()` needs an OpenNext **tag cache** (D1, or a
sharded Durable Object). That is more infrastructure and more spend than the
freshness problem justifies. A deploy invalidates everything instantly anyway,
because the cache key includes `OPEN_NEXT_BUILD_ID`.

### Consequence to accept

Admin edits (site settings, nav, published pages, blog posts) appear within
30 minutes rather than 1. If that ever becomes unacceptable, the fix is a tag
cache — not lowering this number back down.
