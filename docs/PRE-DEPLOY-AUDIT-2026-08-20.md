# Pre-deploy audit — Phases 2+3 frozen build — 20 Aug 2026

**PRE-DEPLOY STATUS: GREEN.** Not deployed; awaiting explicit approval.
All measurements below are LOCAL/LAB, taken against the production build
running in the OpenNext **worker preview** (workerd — the same runtime class
where the original incident lived), not dev mode. Two sandbox constraints
skew some lab numbers and are flagged where relevant: the audit machine's
CPU is slower than typical hardware (inflates TBT), and image.tmdb.org is
unreachable from the sandbox (inflates lab LCP; production serves these
from a fast CDN — live production measured 2.5s fully-loaded earlier today).

## A. Local changes audited (full inventory since the incident fix)

**A. User-facing:** MovieDetail (factual prose, hidden invalid fields),
MovieCard (unchanged this window), homepage section order (Classics shelf
off), ExploreTabs (6 locked industry tabs, "Tonight Mix"), PickStudio
consumed configs (8 locked moods, 6 quick picks), Header/Sidebar/nav
labels + order, /discover hub (new), responsive CSS fixes (pick-section
head stack, tablet header tiers), Discover hub CSS.
**B. Server/data:** lib/quality.ts (new), lib/industry.ts (new),
lib/tmdb.ts (releaseDate/popularity/originCountry mapping, Bayesian Top
Rated, latestEligible, tier filters, southIndianTmdb), lib/data.ts,
lib/browse.ts, app/api/mood (ALL_MOODS + discoveryFilter), app/api/explore
(new), app/movie/[id] (JSON-LD + metadata guards), seed scripts (content
only), scripts/predeploy-check.mjs (new, not shipped to runtime).
**C. Caching:** NONE. No TTL, revalidate, cache-key architecture, R2, or
OpenNext changes. (Latest even reverted to its original discover URL.)
**D. Routing/navigation:** one NEW route: /discover (static, 1-day ISR,
zero data fetches). Label-only nav changes; zero URL migrations/redirects.
**E. Client JS:** ExploreTabs rewrite (same size class), config-driven
mood/quick-pick lists, no new client libraries, no new "use client"
conversions beyond the new small GuideLink/PrivacyChoices from the earlier
analytics work (already live in production).
**F. Build/config:** tsconfig `allowImportingTsExtensions` (type-check
only, no runtime effect), package.json `test` script.
**Phase 1 infrastructure files:** open-next.config.ts verified
`enableCacheInterception: false` in source AND in the built worker
(`enableCacheInterception=!1` in handler.mjs); next.config.mjs unchanged
since the incident fix; middleware.ts untouched; wrangler.jsonc untouched.

## B. Phase 1 regression safety

The audit itself CAUGHT one issue before testing began: the sandbox's
open-next.config.ts carried a leftover `enableCacheInterception: true`
("TEMP sandbox experiment") from the incident investigation — and the
worker built from it reproduced the exact broken signature (segment
prefetches answered with full 19–35 KB payloads). The user's machine file
was always correct; the sandbox file was fixed, rebuilt, and re-verified.
Consequence: `scripts/predeploy-check.mjs` now gates every deploy (checks
interception disabled in the BUILT worker, build not stale, BUILD_ID
consistent). It passes 4/4 on this build.

## C. Request-loop results (worker preview, production build)

Segment prefetch (the incident's root signature): /follow, /free-movies,
/discover all return the canonical 307 → **1,186–1,191 byte** tree
segments with `x-nextjs-postponed: 2` — byte-identical behavior to
verified-healthy production. All 13 chunks referenced by the homepage HTML
exist (200) — no missing-chunk/MIME class issue.

Per-route soak (load → settle → 20s idle), all with **idle growth = 0**
and **zero URLs repeated >3×**: / (43), /discover, /movies (60),
/web-series (60), /trending (63), /free-movies (62), /blog (50), blog
detail (46), /movie/jawan (55), /movie/mirzapur — series (56), /search
(58), /my-list (58).

Long soak: homepage load 43 → **+0 after 2 minutes idle** → picker + quick
pick + mood + Another Pick → +0 after 1 min idle → all 5 Explore tabs
(exactly 5 API calls, one each, closed URLs) → +0 after 1 min → trailer +
watchlist → navigate to a movie (103 total) → back → **+0 after final
1 min idle. Total repeated-URL patterns >6×: none. No behavior resembling
the incident.** Failed requests: only sandbox-unreachable TMDB images and
benign `ERR_ABORTED` prefetch cancellations on navigation; one sandbox-only
/api/comments 500 (Supabase unreachable locally; page renders fine).

## D. Prefetch findings

Initial homepage: 43 requests = document + 13 chunks/CSS + fonts + a
single viewport-driven prefetch pair (tree segment + full RSC) per visible
link. Nav routes are deduplicated by the router across header/sidebar/
bottom-nav (one prefetch each, not three). Below-fold links prefetch only
on scroll-into-view. /signin already prefetch={false} (avoids pulling the
Supabase SDK chunk). /discover prefetch is 2 small requests for a static
1-day-cached page — useful, kept. **Verdict: no wasteful prefetches worth
removing; no changes made.** Disabling card/nav prefetch would save a few
edge-cached requests at the cost of instant navigation.

## E. Cache-key / R2 safety

- /api/mood: closed set — 9 mood ids × clamped numeric opts (pre-existing
  clamps); edge-cached. /api/explore: exactly 5 tab values, 400 otherwise,
  rate-limited, edge-cached — distinct-URL space = 5.
- Phase 3 regional TMDB inventory confirmed: trending 1 + Bollywood 2 +
  South Indian 4 + Korean 2 = 9 fixed URLs, shared, on the existing 6h
  fetch-cache tier. Browse remains page-capped (MAX_BROWSE_PAGE=5).
- Greps for Date.now()/Math.random() in server paths: none in any cache
  key. Math.random exists only in client-side pick logic; Date.now only in
  in-memory memo/rate-limit/eligibility filters and admin slug generation.
  The pre-existing `release_date.lte=<today>` discover param rotates each
  URL once per day (bounded, predates Phase 2, unchanged).
- No user input reaches a persisted cache key; no per-user data in shared
  caches; no N+1 TMDB classification calls (industryOf uses fields already
  in list responses; documented movie-list fallback).

## F–G. Core Web Vitals (LOCAL/LAB — see caveats at top)

| Page | Mode | Perf | FCP | LCP | CLS | TBT | SI |
|---|---|---|---|---|---|---|---|
| / | desktop | 59 | 0.5s | 1.5s | **0** | 1,030ms* | 3.0s |
| / | mobile | 65 | 2.3s | 5.1s* | **0** | 440ms | 4.7s |
| /movie/jawan | desktop | 92 | 0.5s | 1.6s | **0** | 130ms | 0.7s |
| /movie/jawan | mobile | 77 | 1.5s | 4.8s* | 0.024 | 260ms | 2.4s |
| blog article | mobile | 74 | 1.1s | 3.9s* | **0** | 570ms* | 1.4s |
| /discover | mobile | 86 | 1.1s | 3.5s | **0** | 260ms | 2.3s |

\* Sandbox-skewed: mobile LCP includes image.tmdb.org connection timeouts
that cannot occur in production (live prod measured 2.5s fully loaded, TTFB
217ms today); TBT is inflated by the slow audit VM — the dominant long
tasks are React hydration of the framework chunk, identical to the
already-live production bundle (no new heavy client code was added).
Local TTFB: 30–90ms.

## H. LCP element

Homepage: hero poster (middle of 3); exactly ONE image carries `priority`
(`priority={i === 1}`) — no poster-collage preloading. Movie detail: dbar
poster, priority, sized `(max-width:900px) 30vw, 120px`. Blog article:
featured image, priority, `(max-width:900px) 100vw, 760px`. No
CSS-background LCP, no lazy-loaded above-fold media, fonts self-hosted via
next/font/local (no render-blocking external font CSS).

## I. CLS

0 on five of six audits; 0.024 (good) on movie mobile. Poster containers
use fixed aspect-ratio boxes; provider logos have fixed dimensions;
trailer is a stable thumbnail box; Tonight's Pick swaps content inside a
fixed card; Explore tab panel is a fixed grid; fonts use next/font with
size-adjusted fallbacks.

## J. INP / main thread

All picker interactions (mood select, quick pick, Another Pick, tab
switch) are local state updates + at most one fetch; handlers are trivial
(no synchronous filtering of large arrays on the main thread — pools are
≤20 items). Long tasks in the trace are framework hydration only, at page
load, not interaction time. Homepage remains server-rendered with 8 small
client islands ("use client" total across components: 32, unchanged
class; no island grew).

## K. JS bundle

Homepage transfer: **163 KB JS (gzip, 11 scripts)** — dominated by the
shared React/Next framework chunk (~1.3s bootup on the slow audit VM; this
chunk is byte-class identical to what production already ships). No new
dependencies were added in Phases 2/3 (config + pure helpers only). No
duplicate packages found in chunks. YouTube: iframe renders only after a
Play click with a resolved key — confirmed 0 YouTube frames pre-click.
Supabase SDK stays behind lazy import gated on an auth cookie.

## L. Images / fonts

All Movie/blog images use next/image with `fill` + explicit `sizes`; cards
request w342 posters for ≤172px slots (2× DPR-correct, not full-res);
below-fold lazy by default; 22 images = 16 KB placeholders in lab (TMDB
unreachable). Fonts: 8 self-hosted woff2 files (Inter 400/500/600/700 +
Poppins 400/600/700/800), 127 KB total, font-display via next/font —
pre-existing set, unchanged; trimming weights is a possible later
micro-optimization, not done (visual risk > gain).

## M. Network request counts

Homepage 43 · movie detail 55–56 · listings 50–63 · after full interaction
battery + navigation cycle: 103 total, then permanently flat. Total
homepage transfer 596 KB (incl. 135 KB document with the RSC payload,
127 KB fonts, 163 KB JS).

## N. Safe fixes made during this audit

1. Sandbox open-next.config.ts leftover (`interception: true` TEMP line)
   restored to `false` — sandbox-only file; user/production copies were
   already correct. BEFORE: worker served 19,366-byte full payloads for
   segment requests; AFTER: 1,186-byte segments with postponed marker.
2. `scripts/predeploy-check.mjs` added as a permanent deploy gate.
No other fixes were needed — image sizing, priority discipline, lazy
trailers, and prefetch hygiene all passed as-is.

## O. Tests / build

`npm test` 29/29 · `tsc --noEmit` clean · `next build` clean ·
`npx opennextjs-cloudflare build` clean (no errors/warnings beyond the
known Windows-compat and punycode-deprecation notices) ·
`node scripts/predeploy-check.mjs` 4/4 ✓.

## P. Remaining risks

- Lab TBT on the slow VM can't fully predict real-device INP; the code
  audit shows no new interaction-time work, and production field data (GA4
  is live) will confirm post-deploy.
- Sandbox cannot exercise real TMDB data paths end-to-end (pools verified
  against live TMDB earlier via browser-proxied fetches; unit tests cover
  the logic). First hours after deploy: spot-check Explore tabs and
  Latest with real data.
- The one-per-day rotation of `release_date.lte=<today>` discover cache
  keys is pre-existing, bounded, and unchanged — noted for completeness.

## Q. Recommendation

**DEPLOY (when the Phase 1 green window completes)** — via:
`npx opennextjs-cloudflare build` → `node scripts/predeploy-check.mjs` →
`npx opennextjs-cloudflare deploy`. No purge. Post-deploy: verify segment
prefetch bytes on /follow, watch a Network tab for 2 idle minutes, check
R2 Class A the next day.

**PRE-DEPLOY STATUS: GREEN** — stopping here; not deploying.
