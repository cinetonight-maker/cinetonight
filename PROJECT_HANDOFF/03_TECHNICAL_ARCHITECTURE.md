# 03 — Technical architecture

Grounded in the actual files. Unknowns are marked.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16.3.0, App Router, Turbopack |
| UI | React 19.2, TypeScript 7 (`strict`) |
| Adapter | `@opennextjs/cloudflare` 1.20.2 |
| Runtime | Cloudflare Workers (workerd) |
| Page cache | Cloudflare R2 + regional cache |
| Tag cache | Cloudflare D1 |
| Revalidation queue | Cloudflare Durable Object |
| Database / auth | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) |
| Title data | TMDB API |
| Availability | JustWatch via TMDB |
| Markdown | `marked` v18, escape-then-parse |
| Analytics | GA4 `G-641P0WNNTW` |

## Key directories and files

```
app/                 routes
  (home)/            homepage + its loading.tsx (route-grouped deliberately)
  movie/[id]/        THE money page
  blog/(index)/      blog index (route-grouped)
  blog/[slug]/       article
  author/[slug]/     author pages (PENDING, not deployed)
  person/[id]/       noindex, force-dynamic
  channel/[slug]/    15 platform pages
  free-movies/       public-domain classics
  [slug]/            CMS custom pages, force-dynamic
  admin/             full CMS
  api/               watch, search, browse, mood, explore, comments, admin, cron
  robots.ts sitemap.ts
lib/
  tmdb.ts            TMDB access, TTL policy, browse, providers
  quality.ts         data-quality single source of truth (tiers, ratings, years)
  watchRows.ts       server-only Where-to-Watch row builder
  authors.ts         author registry (PENDING)
  metaDesc.ts        word-boundary meta trimming (PENDING)
  revalidatePlan.ts  what an admin action invalidates
  pathGuard.ts       middleware URL plausibility guard
  region.ts          visitor country from cf-ipcountry / x-vercel-ip-country
  site.ts            baseUrl(), title templates, listing metadata
  markdown.ts        escapes every "<" before parsing — no raw HTML renders
middleware.ts        path guard, genre 308s, Supabase session, admin gate
open-next.config.ts  cache/queue/tag-cache overrides
wrangler.jsonc       bindings
d1/tag-cache-init.sql
supabase/*.sql       additive, idempotent migrations
scripts/*.mjs        content import/export, predeploy, seeds, sync
```

## Request flow

```
Visitor
  → Cloudflare edge
  → Worker (OpenNext)
      → middleware.ts
          guardPath()  → 404 no-store for impossible URLs (before any render)
          genre canonicalisation → real 308
          Supabase session refresh (skips public read-only APIs)
          /admin + /api/admin gate via admin_users allowlist
      → route
          ISR hit  → R2 (fronted by regional cache) → serve
          ISR miss → render → persist to R2 → serve
          dynamic  → render per request, nothing persisted
  → response
```

Client islands then fetch per-visitor data (`/api/watch`) after load.

## Cache architecture and the reasoning behind it

- **R2 incremental cache** wrapped in `withRegionalCache(..., mode: "long-lived",
  shouldLazilyUpdateOnCacheHit: false)`. The `false` is a cost decision: lazy
  refresh turned plain reads into extra R2 operations for no visible freshness.
- **DO queue** (`queueCache(doQueue, { regionalCacheTtlSec: 5 })`). Before it,
  every Cloudflare location independently regenerated the same stale page. One
  expired page became many identical R2 writes.
- **D1 tag cache** wrapped in `withFilter(isCmsTag)` so only CMS tags consult
  D1. Movie, person and browse routes never touch it.
- **`enableCacheInterception: false`** — disabled 20 Aug 2026. It was the root
  cause of a production RSC prefetch loop (~40 req/s per tab, 25k+ requests in
  one session). **Never re-enable.**
- **`cdnInvalidation` not enabled** — OpenNext's purge uses Cloudflare cache
  tags, which are Enterprise-only. Edge purge is instead a single-file purge of
  exact URLs from `lib/revalidateCms.ts`.

### TTL policy (`lib/tmdb.ts` `ttlFor`)

| Class | TTL | Applies to |
| --- | --- | --- |
| `stable` | 72h | title/person detail, credits, images |
| `steady` | 24h | discover lists, **watch/providers** |
| `fresh` | 6h | trending, now playing, popular, upcoming |
| `search` | 24h | cached internal search |

**Critical mechanic:** Next sets a segment's revalidate to the **shortest** TTL
among its fetches. This is why `/movie/[id]` declares 259200 (72h) but shows 6h
on curated titles — `trendingLiveTmdb` (6h) is in that branch.

## Environment variables

Required: `TMDB_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`.
Optional: `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_DEFAULT_REGION` (dev only).
**Not set (and this causes a real bug):** `CACHE_PURGE_ZONE_ID`,
`CACHE_PURGE_API_TOKEN`.

**`NEXT_PUBLIC_SITE_URL` is load-bearing.** `baseUrl()` falls back to
`https://${VERCEL_URL}` then `http://localhost:3000`. Every canonical, OG URL
and sitemap entry routes through it.

## Deployment flow

```
npx tsc --noEmit
npx opennextjs-cloudflare build
node scripts/predeploy-check.mjs      # must print 4/4
npx opennextjs-cloudflare deploy
```

`predeploy-check.mjs` verifies: cache interception disabled in the *built*
worker; disabled in source; build newer than every source file; BUILD_ID
consistent. It does **not** verify that `/movie/[id]` is still SSG rather than
dynamic — check the route table manually.

## Technical decisions and why

| Decision | Reason |
| --- | --- |
| `/person/[id]` force-dynamic | ISR on an unbounded id space grew R2 to 2.79M objects / 211 GB |
| `/blog/[slug]` force-dynamic | Invented slugs persisted one 77KB+ R2 object each |
| `/[slug]` force-dynamic | Same, plus no route-cache entry to invalidate |
| Path guard in middleware | The R2 write happens because the route rendered; validation must precede rendering |
| Genre 308 in middleware | In-render `permanentRedirect()` returns 200 on this stack, not 308 |
| `images.unoptimized: true` | Vercel's 5,000/month optimizer cap exhausted and broke every poster |
| Person pages noindex+follow, not robots-disallowed | A disallowed URL is never crawled, so Google never reads the noindex |
| Sitemap omits person pages | Submitting a noindex URL is a self-contradiction GSC reports as an error |
| No `lastModified` except blog posts | Stamping "modified now" on every crawl is a lie Google learns to ignore |
| TMDB batch capped at 150 in sitemap | Advertising every live-TMDB page invited crawl storms |
| Markdown escapes `<` before parsing | No raw HTML from the database can reach a page |

## UNKNOWN

- Cloudflare account plan tier (Workers Paid is implied by the ~6.4 MB bundle
  exceeding the 3 MiB free limit, but not confirmed)
- Supabase plan and quotas
- Whether a Cloudflare Cache Rule exists for any path
- Cron scheduler configuration (routes exist and expect `CRON_SECRET`;
  `docs/CLOUDFLARE-FALLBACK.md` says the two Vercel crons need moving to
  Cloudflare Cron Triggers, but whether that was done is unrecorded)
