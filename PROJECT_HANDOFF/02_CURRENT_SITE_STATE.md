# 02 — Current site state

**As of 31 August 2026.** LIVE/PRODUCTION and LOCAL/PENDING are separated
explicitly throughout. Nothing here is aspirational.

---

## PRODUCTION STATUS

**Live and serving.** Last actual deploy: **22 August 2026**, Worker version
**`8682b8f8-4a69-4669-bd0b-14f786a38f59`**, rollback target `9cd4711d`.

**Two commits landed after that deploy and were never shipped:**
- `ef058fc` (23 Aug) — admin CMS, SEO phases 4A-4B, deploy tooling
- `3827a4c` (23 Aug) — rebuild five posts, FAQ schema, corrected checklist rules

Whether `3827a4c`'s FAQ-schema code is live is **UNKNOWN**. Its *content*
changes are live, because blog bodies live in Supabase, not in the build.

**Important habit to know:** this repo commits *after* deploying.
`DEPLOY-2026-08-22.md` was itself added in the 23 August commit. Never infer
what is live from git history alone.

## ARCHITECTURE (live)

- **Framework:** Next.js 16.3.0, App Router, Turbopack, React 19, TypeScript 7
- **Adapter:** `@opennextjs/cloudflare` 1.20.2 (`@opennextjs/aws` 4.1.0)
- **Hosting:** Cloudflare Workers. Previously Vercel; migrated 15 August 2026
- **Database / auth:** Supabase
- **Title data:** TMDB. **Availability data:** JustWatch via TMDB
- **Analytics:** GA4, id `G-641P0WNNTW`, consent-gated, advertising signals off

### Cloudflare bindings (`wrangler.jsonc`)

| Binding | Type | Purpose |
| --- | --- | --- |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 | `cinetonight-cache` — ISR page cache |
| `NEXT_TAG_CACHE_D1` | D1 | `cinetonight-tags`, id `f5232324-b3ad-441e-b4b8-97a47dd813c6` |
| `NEXT_CACHE_DO_QUEUE` | Durable Object | `DOQueueHandler` — global revalidation dedupe |
| `WORKER_SELF_REFERENCE` | Service | Self-call for background regeneration |
| `ASSETS` | Assets | `.open-next/assets` |

`compatibility_date` 2026-08-01, flag `nodejs_compat`.

## ROUTES (from the 26 Aug production build)

**Static / ISR:** `/` (15m), `/blog` (10m), `/discover` `/faq` `/follow`
`/free-movies` `/signin` `/signup` `/admin/login` `/pricing` (1d), `/genres` (6h),
`/links` (30m), `/movie/[id]` (SSG + ISR, `revalidate = 259200` declared;
effective 6h on curated titles because `trendingLiveTmdb` carries a 6h TTL).

**Dynamic:** `/[slug]`, `/movies`, `/tv-shows`, `/web-series`, `/trending`,
`/latest`, `/blog/[slug]`, `/channel/[slug]`, `/free-movies/[slug]`,
`/person/[id]`, `/search`, `/p/[slug]`, `/sitemap.xml`, `/rss.xml`, `/account`,
`/my-list`, all `/admin/*` and all `/api/*`.

**Redirects at config level:** `/p/:slug` → `/:slug` (308), `/pricing` → `/` (308).

## SYSTEMS

**Movie/series.** `/movie/[id]`. Curated catalogue prebuilt via
`generateStaticParams`; anything else rendered on demand. One URL per title
enforced with a real 308. Self-referencing canonical. Movie/TVSeries JSON-LD
with honest rules: no fabricated `ratingCount`, `datePublished` only when
genuinely released, series typed `TVSeries`.

**Blog.** Supabase-backed, `force-dynamic` (deliberate — see problems doc).
BlogPosting + BreadcrumbList + FAQPage JSON-LD. Admin CMS with an 18-check
publish checklist, revisions, redirect manager.

**Discovery.** Mood picker, Quick Picks (including an existing **"Under 90
Minutes"** filter in `lib/quickPicks.ts`), Explore tabs, `/discover`, genres,
trending, latest, 15 channel pages, 19 free classics.

**Where to Watch.** Client island calling `/api/watch`, region resolved from
`cf-ipcountry`. **In production today it shows a crawler nothing** — see below.

**Caching.** R2 incremental cache behind a regional cache
(`mode: "long-lived"`, `shouldLazilyUpdateOnCacheHit: false`), DO queue
dedupe, D1 tag cache filtered to CMS tags only, `enableCacheInterception: false`.

## CURRENTLY WORKING

- Crawling, indexing and canonicals — verified live via GSC URL Inspection
- robots.txt matches source exactly; Googlebot unrestricted
- Movie page templates, schema, titles, canonicals
- ~24,000 pages indexed
- Blog publishing pipeline, admin CMS, redirect manager
- Test suite: 286/286 passing
- Sitemap: reported **Success** in Search Console

## CURRENTLY BROKEN OR LIMITED (live)

1. **Where to Watch is invisible to Google.** `/api/watch` is robots-disallowed,
   so crawlers index `"Checking availability in your country…"` on ~24,000
   pages. **Fixed in the pending batch, not yet deployed.**
2. **Launch-day cache entries.** Several hub/custom pages still serve their very
   first render from 14 August — pre-rebrand "MOVIEX" branding, and `/trending`
   carries a cross-domain canonical to
   `cinetonight-lj9xhtkg1-cine-tonight.vercel.app`. Root cause: the edge purge
   secrets are unset. **Not fixed. Needs a purge and the two secrets.**
3. **Traffic collapse** from ~170 clicks/day to ~3. No technical cause found.
4. **Person pages** are `noindex, follow` and `force-dynamic` by design.
5. `/movies` sort is not read from the URL — only `genre` is. Sorting is
   client-side, so sorted views are not shareable or crawlable. Minor.

## MUST NOT BE CHANGED

- `enableCacheInterception: false`
- The D1 `revalidations` table
- No `loading.tsx` on routes calling `redirectOrNotFound`
- No per-path database queries
- Person-page noindex decision — it was intentional, do not reverse it because
  the indexed count dropped
- No H1 in blog or page bodies
