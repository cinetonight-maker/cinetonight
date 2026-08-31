# 04 — Cloudflare and cost history

**Accuracy warning.** The session this handoff draws on (25-26 August 2026) did
**not** review any Cloudflare billing dashboard, usage analytics, or metrics
page. Every figure below comes from **code comments and project docs written at
the time of the incidents**. No live usage number was verified.

Several items requested for this document were never discussed and are recorded
as UNKNOWN at the end.

---

## The R2 cost incident (the defining event)

**Recorded figures**, from `open-next.config.ts`, `app/person/[id]/page.tsx`,
`docs/SEO-PHASE-4B-*.md` and `next.config.mjs`:

- R2 bucket grew to **2.79M objects / 211 GB in a fortnight**
- **~1,000,000 R2 write operations per day**
- Described as a **"$70/month surprise"**
- R2 **writes (Class A) are ~10x the cost of reads (Class B)**

**Cause.** `/person/[id]` accepted any `tmdb-p-<id>`, i.e. the whole of TMDB's
person database. Every movie page links ~10 cast members; every person page
links their filmography, which links more cast. A self-expanding graph. With
ISR on, every invented URL became a **permanent** R2 object.

**Fixes applied:**
1. `/person/[id]` → `force-dynamic` (writes nothing to R2)
2. `/blog/[slug]` and `/[slug]` → `force-dynamic` for the same reason
3. `lib/pathGuard.ts` in middleware — rejects impossible URLs before rendering
4. DO queue — one global regeneration instead of one per Cloudflare location
5. `shouldLazilyUpdateOnCacheHit: false`
6. Browse depth capped: `MAX_PAGES` reduced from 50 to 15
7. Longer ISR windows

**Measured (`docs/SEO-PHASE-4B-3-MEASUREMENT.md`, 22 Aug, `wrangler dev --local`):**
- 10 requests to 10 invented slugs → **10 R2 objects**, both for 404s and 308s
- Repeat hits to the same slugs → **0 new objects**
- Object sizes: 41 objects, smallest **77,530 bytes**, largest 322,382, none under 20 KB
- 404 responses carry `private, no-cache, no-store` — **not edge-cached at all**
- 308 responses keep `s-maxage=3569, stale-while-revalidate=2592000`

## Other recorded incidents

**The RSC prefetch loop.** `enableCacheInterception: true` mishandled Next 16
prefetch header variants on statically cached routes. Observed **~40 req/s per
tab**, **25,000+ requests in one session**, on `/follow`, `/free-movies` and
classic detail pages. Disabled **20 August 2026**. Must stay `false`.

**The `_next/image` replay.** Crawlers replayed remembered optimizer URLs:
**85,000 hits in one observed day**, each waking the server. Now disallowed in
robots.txt for all groups.

**Broken posters.** Vercel Hobby image optimizer capped at 5,000/month; once
exhausted, the whole catalogue's images failed. Fixed with `unoptimized: true`.

**The D1 tag cache table that never existed.** Found **22 August 2026**.
`withFilter()` renames the tag cache to `filtered-d1-next-mode-tag-cache`,
which does not match the name `populateCache` switches on, so the
`revalidations` table was silently never created. Deploy output said
*"Tag cache does not need populating"* and it was misread. Every read path
returns a safe-looking default on error, so a missing table read as
"nothing has ever changed". Fixed same day with `d1/tag-cache-init.sql`.

## Deployment-adjacent dates that ARE established

| Date | Event |
| --- | --- |
| 14 Aug 2026 | Site went live; rebrand commit `39db5f1` |
| 15 Aug 2026 | Cloudflare migration (`5cde30e`, `82babd7`) |
| 16 Aug 2026 | `56cfa8a` cut R2 write ops, longer ISR, cache interception ON |
| 18 Aug 2026 | `66053cb` R2 round 2 — DO dedupe, 5-page browse cap |
| 20 Aug 2026 | Cache interception disabled; `docs/PRE-DEPLOY-AUDIT-2026-08-20.md` — status GREEN, **not deployed** |
| 22 Aug 2026 | Production deploy `8682b8f8`; 84 R2 cache entries populated; Worker startup 30 ms |
| 23 Aug 2026 | Two commits, never deployed |

## Current security configuration

See `11_CURRENT_SECURITY_CONFIGURATION.md` for the full rules. Summary:
4 custom rules existed, one was deleted during the last session, one was
corrected. Bot policies: Search **Allow**, Agent **Allow**, Training **Allow**.

## Unresolved

**The edge purge secrets are unset.** `CACHE_PURGE_ZONE_ID` and
`CACHE_PURGE_API_TOKEN` are not configured, so `lib/revalidateCms.ts` reports
`cdn: "not-configured"` and skips the single-file purge on **every** publish.

`docs/D1-TAG-CACHE-BUG.md` assessed this as *"currently costs nothing"* because
production carried no `cf-cache-status` at the time. **That assessment is now
out of date** — it is why launch-day pages sat stale for twelve days.

## Current hypothesis on cost

R2 growth is believed **contained** by the force-dynamic conversions and the
path guard. This is **inference from the fixes, not from a verified usage
graph.** Nobody has looked at the R2 dashboard since. **Verify before assuming.**

## UNKNOWN — explicitly not established

The following were requested but appear **nowhere** in the session or the files:

- Current R2 storage, Class A and Class B operation counts
- Workers CPU time and request volume
- TMDB subrequest counts
- **Cache hit rate** — never measured
- A cost history with actual billing figures
- **"August 15-17 issue"** — no discretely recorded event under that name
- **"August 27 deployment"** — no such deploy is recorded; the last is 22 Aug
- **"August 29 activity spike"** — no data
- **AI crawler traffic volume** — only one figure exists: Cloudflare Rule 3 had
  **69,410 events** when inspected on 26 August. No time window was shown.
