# Phase 1 — final completion pass report

**Code complete: 18 Aug 2026.** One deploy pending (§G). Deploy commands and
measurement checklist at the end.

---

## A. Root-layout TTL ceiling — root cause, fix, evidence

**Cause (traced, not assumed):** `lib/supabase/public.ts` applied ONE blanket
`revalidate: 1800` to every anonymous Supabase read. The root layout reads
site settings (twice: metadata + render) and the Footer reads nav links +
settings — all inside every route's render tree — so every route's effective
revalidate was min(route, 1800) = **30 minutes**. Two more cappers surfaced
during the trace: blog teasers (`BlogSection` on genre/listing pages,
`BlogWidget` on movie pages) rode the same 1800s tier into non-blog routes,
and the TMDB `/search` TTL (1h, used by classics enrichment) capped the
free-movies routes at 1 hour.

**Fix:** tiered public reads (`PUBLIC_TTL` in `lib/supabase/public.ts`):

- **stable 24h** — site settings, footer/nav links, classics, custom-page
  slugs (layout-level, branding-stable data)
- **catalogue 6h** — the movies table, and blog reads when embedded as
  teasers in non-blog routes
- **default 30m** — blog reads on blog surfaces (scheduled posts still appear
  within 30 min) and home_config

Plus: TMDB `/search` TTL 1h → 24h (safe: user queries are no-store; only
bounded internal lookups use cached search).

**Bonus fix found during the trace — an unbounded Class A writer:**
`getMovie(id)` ran a per-id Supabase query (`.eq("id", <id>)`) for every id
not in the curated list — i.e. **every live-TMDB title page and every junk id
a crawler invents**, each minting its own 30-min data-cache entry on the
site's hottest route family (also reachable via `/api/title` and
`/api/trailer`). It was provably redundant: `getMovies()` selects the whole
table, so any row the per-id query could find is already in that list.
`getMovie` now resolves against the cached list + bundled fallback — the
per-id query is gone entirely.

**Build evidence (production route table, after fix / before fix):**

| Route family | Intended TTL | Effective (was) | Effective (now) | Determined by |
|---|--:|--:|--:|---|
| Homepage `/` | 15m | 15m | **15m** | its own `revalidate = 900` |
| Movie detail `/movie/[id]` | 72h | 30m | **6h** | trending/latest rails (TMDB fresh 6h) + movies table 6h — a real freshness need; the 72h intent is unreachable while pages embed trending rails, and 6h is 12× fewer rewrites than 30m |
| `/genres` | 24h | 30m | **6h** | movies table + embedded blog teaser (6h tier) |
| `/free-movies`, `/free-movies/[slug]` | 24h | 1h | **24h** | own revalidate; search TTL no longer caps it |
| `/faq`, `/follow`, `/_not-found`, admin login | 24h | 30m | **24h** | own revalidate + stable-tier layout reads |
| `/blog` | 10m | 10m | **10m** | own `revalidate = 600` (intended) |
| `/blog/[slug]` | 30m | 30m | **30m** | own revalidate + default-tier blog read (intended — scheduled posts) |
| `/movies` `/tv-shows` `/web-series` `/trending` `/latest` | dynamic | dynamic | **dynamic** | force-dynamic + 1h edge header (no R2 page writes) |
| `/[slug]`, `/person/[id]`, `/channel/[slug]`, `/search` | dynamic | dynamic | **dynamic** | force-dynamic by design |

## B. Pagination validation

`/api/browse` `page` handling, enforced **before any TMDB/Supabase/cache
work** (a regex test is the first thing that touches the value; rejection
returns immediately):

- absent → page 1 ✓; `1 2 3 4 5` → 200 ✓
- `6, 50, 999999, 0, -1, abc, 1.5, 1e5, whitespace, "05"` → **404**, verified
  by the live matrix below. Explicit input is never coerced.
- Defense in depth: `getBrowsePage` still clamps, and every TMDB browse path
  caps `totalPages` at 5 so the UI cannot emit an out-of-range request.

Matrix (local production build): `''→200 1→200 2→200 5→200 6→404 50→404
999999→404 0→404 -1→404 abc→404 1.5→404 1e5→404 ' '→404 05→404`. For every
404, no TMDB call, no Supabase call, no browse work, no cache entry — the
handler returns before `getBrowsePage` is invoked (only the in-memory rate
limiter runs first).

## C. Edge query-string fragmentation — yes, and here is the manual rule

Audited: the listing shells (`/movies`, `/tv-shows`, `/web-series`,
`/trending`, `/latest`) read **only `genre`** server-side — HTML, metadata
and canonical all depend on `genre` and nothing else (`?page` is client
state; canonicals never include it). So `/movies?page=37`,
`/movies?utm_source=x`, `/movies?random=1` all render identical HTML but
fragment the edge cache into separate entries → avoidable Worker invocations.

**Recommended Cloudflare Cache Rule (apply manually — I cannot and should
not touch the dashboard):**

- **Name:** `browse-shell-query-normalize`
- **When:** Hostname equals `cinetonight.com` AND URI Path is in
  `{/movies, /tv-shows, /web-series, /trending, /latest}` (exact paths, no
  wildcards — this must never catch `/api/*` or any other route)
- **Then:** Cache eligible; **Custom cache key → Query string → Include:
  `genre` only**
- **Excluded by construction:** `/api/browse`, `/api/search`, `/api/mood`,
  `/api/title`, `/api/watch` and every other API (params change responses
  there) — the exact-path match cannot touch them.
- **Effect:** all irrelevant-query variants of a shell collapse into one
  edge entry per genre. **Risk:** near zero — the only param that changes
  the response is the one kept; worst case is over-collapse of a param we
  add later, fixed by adding it to the include list.

## D. Remaining Class A writers after this pass

**Expected, healthy:** ISR expiries at the new TTLs (homepage 96/day; each
cached movie page ≤4/day; blog surfaces by design); tiered TMDB data-cache
expiries (trending-class 4/day per list; discover 1/day; titles every 3
days); Supabase data-cache expiries (settings/nav 1/day, movies table 4/day,
blog reads ≤48/day); first-ever visits to uncached live-TMDB titles (one
page + a few data entries each — inherent to the large-catalogue design);
one full-generation rewrite per deploy (build-ID key — batch deploys).

**Potentially avoidable, known, deferred:** day-precision date in discover
URLs (one new key set/day — accepted); movie-page ceiling could reach 24h+
only by removing live rails from the page (product change — not Phase 1);
`/blog/[slug]` ISR spray writes 404 page entries for junk slugs (data-cache
side already bounded; page-cache side accepted, WAF-mitigated).

## E. Files changed in this pass

`lib/supabase/public.ts` (tiered TTLs), `lib/data.ts` (tiers; getMovie via
list — per-id query removed), `lib/tmdb.ts` (search TTL 24h),
`lib/classics.ts` (stable tier), `app/[slug]/page.tsx` (stable tier),
`app/api/browse/route.ts` (strict page validation), `components/Footer.tsx`
(stable tier), `components/BlogSection.tsx` + `components/RightRail.tsx`
(teaser 6h tier), `docs/PHASE1-FINAL.md` (this report).

## F. Build & test results

TypeScript: clean. Production Next build: clean (route table above).
OpenNext Cloudflare build: clean. Regression matrix — homepage, all five
listing shells, `/genres`, genre filter, normal + long-tail search, blog
list + detail, `/my-list`, movie detail, `/free-movies`: all 200; §13 matrix
as in B. (Lint: no ESLint flat config exists in the repo — unchanged
situation, nothing new introduced.) No feature behaviour changed; only TTLs,
validation, and one redundant query.

## G. Deployment timestamp

Deploy from your machine, then **record the exact time**:
`npm run build && npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`
Write the timestamp here: **2026-08-20 08:35 UTC (13:35 PKT)** — version
`251fe865-cfc0-4de6-98ff-49b93d1fb148` (all measurement windows count
from it).

Note: an earlier deploy the same morning (version `88a656f7…`) shipped a
STALE `.open-next` — `deploy` does not rebuild; always run
`npx opennextjs-cloudflare build` first. Verified live after the correct
deploy: segment prefetches return proper ~1.2KB tree segments
(`x-nextjs-postponed: 2`), RSC responses no longer receive the custom
Cache-Control rules, and fresh page loads settle at ~25–30 requests with
zero network activity afterwards (the prefetch loop is gone; measured in
the same browser that previously looped at ~54 req/s).

## H. What to inspect in Cloudflare (6h / 12h / 24h / 48h)

- **R2 → cinetonight-cache → Metrics:** Class A ops, Class B ops, storage,
  object count. Class A is THE number: green < 30k/day, very good 30–50k.
- **Workers & Pages → [worker] → Metrics:** requests, subrequests, CPU time
  (expect ~20–25ms median unchanged), errors (expect ~0), cache hit rate
  (expect ~98%).
- Judge only windows entirely AFTER the §G timestamp; the deploy itself
  causes one expected write burst as the new generation fills.

## I. Cleanup readiness + old-build dry-run methodology (NOT executed)

The app is **technically ready for the two-day observation period** once §G
is deployed. Nothing was deleted; no lifecycle rule was created.

Old-generation identification is **exact**, verified from the installed
OpenNext source: every object key is
`incremental-cache/<OPEN_NEXT_BUILD_ID>/<sha256>.<cache|fetch>` — the build
id is a literal path segment. Dry-run (read-only), after two green days:

1. On the deploy machine, read the LIVE generation id: `.next/BUILD_ID`
   from the exact build that was deployed.
2. `npx wrangler r2 object list cinetonight-cache --prefix incremental-cache/ ...`
   aggregating by the second path segment → objects + bytes per generation.
3. Report: per-generation counts/sizes; everything ≠ the live id is
   unreachable by the running worker (reads always embed the current id).
   Do NOT touch: the live generation, and any keys not matching the
   `incremental-cache/<id>/...` pattern (there should be none, but the
   dry-run must prove that rather than assume it).
4. Only after you approve that report: delete old generations, then decide
   on the 14-day lifecycle rule as a safety net.

## J. Remaining Phase 1 blockers

None in code. The only open item is production proof: deploy once (§G) and
measure (§H). Documented for Phase 2, per instructions: soft-404 (junk slugs
stream a noindex 404 UI with HTTP 200 — framework streaming behaviour; no
trivial pre-stream fix exists without restructuring, left documented) and
the search robots/noindex strategy review.
