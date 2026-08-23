# Phase 2 — Catalogue & Data Quality: final report

**Code complete: 20 Aug 2026. LOCAL ONLY — not deployed, per the brief.**
Deploy only after Phase 1 production metrics are proven healthy (2 green
days): `npx opennextjs-cloudflare build` then `npx opennextjs-cloudflare
deploy`. **No blanket cache purge.** Do not purge R2, and do not use
Cloudflare "Purge Everything" as a routine step — HTML edge entries expire
on their own (most within 1h, movie pages within 12h per the header rules)
and old static chunks remain served until then. Use a TARGETED purge (Purge
by URL/prefix on the specific affected pages) only if a concrete stale-edge
problem is observed and confirmed after deploy.

---

## Files changed

| File | Change |
|---|---|
| `lib/quality.ts` | **NEW** — the single source of truth: years, release status, media-type normalization, rating display, Bayesian ranking, Tier A/B/C, field display helpers, factual-only About prose |
| `lib/types.ts` | `Movie.releaseDate?: "YYYY-MM-DD"` added (optional, backward compatible) |
| `lib/tmdb.ts` | all 3 mappers capture `releaseDate`; Top Rated re-ranked Bayesian; Latest vote floor 1→10 + tier filter; Trending drops Tier C; browse rating sort Bayesian in both branches; recommendations tier-filtered |
| `lib/data.ts` | local-catalogue `topRated` Bayesian; `trendingNow` tier-filtered |
| `lib/browse.ts` | local fallback rating sort Bayesian |
| `components/MovieDetail.tsx` | fabricated prose removed → `factualAbout()`; info grid hides missing fields; meta strip guards year/runtime/cert/rating; empty Cast section hidden |
| `app/movie/[id]/page.tsx` | JSON-LD: series = `TVSeries`, no year-0 `datePublished`, no fabricated `ratingCount`, no "—" Person, upcoming = no datePublished; `<title>`/description guard year 0 and use future wording for upcoming |
| `app/api/mood/route.ts` | recommendation pool passes `discoveryFilter` before response |
| `tests/quality.test.mjs` | **NEW** — 15 regression tests |
| `package.json` | `npm test` script (Node built-in runner, zero new dependencies) |

## Catalogue tiers (lib/quality.titleTier)

- **Tier A (discovery):** real title + normalized kind + poster + overview
  (≥40 chars, not a placeholder) + valid year (1895 → now+3, or a valid
  upcoming date) + vote signal (≥50 movie / ≥20 series; an upcoming title
  with poster+overview+future date qualifies without votes, since votes
  cannot exist yet).
- **Tier B (long-tail):** real title + kind + at least one of
  poster/overview. Searchable, direct URL works, related rails may use it
  as top-up — never dominates discovery shelves.
- **Tier C (weak/junk):** fails B. Never promoted anywhere. **Never
  deleted.** noindex decision deferred to Phase 4 (SEO).
- `discoveryFilter(list, minKeep)` = Tier A, topped up from B only if a
  shelf would fall under `minKeep` — a strict filter can never blank a
  shelf; Tier C never appears.

## Top Rated — exact formula

`WR = (v/(v+m))·R + (m/(v+m))·C` (IMDb weighted rating), where R = the
title's TMDB average, v = its vote count, C = the mean rating of the
qualifying pool (fallback 6.5 for pools under 5 titles), and m = **500 for
movies, 200 for series**. Titles below **RANK_MIN_VOTES (50 movie / 20
series)** are excluded from ranked lists entirely. Result: 10.0-from-2-votes
loses to 8.7-from-30,000 (regression-tested). Applied in: `topRatedTmdb`
rail, browse `sort=rating` (single-kind and merged), and the local-catalogue
fallbacks. Pure in-memory re-sorts of already-fetched data.

## Media type

`normalizeKind()` maps every variant (`tv`, `show`, `film`, `web series`,
casing, etc.) to exactly `movie | series`; unknown input returns `null`
(Tier C) rather than silently defaulting. Detail schema now types series as
`TVSeries`. **Documented for Phase 4, unchanged now:** every title —
including series — lives at a `/movie/<id>` URL (MovieCard hardcodes it);
breadcrumbs already say TV Shows for series but the URL contradicts it. A
redirect strategy belongs to the SEO phase.

## Invalid-data handling

Hidden, never faked: year 0/NaN/out-of-range (card meta, detail grid, page
title, JSON-LD), rating with zero votes (never renders "0.0"; "Not rated
yet" only for *released* titles), runtime "—"/"0 min"/"NaN", certification
"NR", placeholder people ("—"), empty Cast section. `Det` rows skip null
values entirely. The image fallback system (lib/images.ts, branded
placeholders) already existed and is the single fallback path — quality code
guarantees it never receives a fabricated URL.

## Generated prose

Removed sitewide (was on EVERY detail page): *"leans on a strong ensemble —
X — to carry a story that balances spectacle with character"* and *"landed
with audiences for its craft and performances, and remains one of the most
talked-about … titles of {year}"* — plus the broken "— — —" it rendered with
missing cast. Replaced by `factualAbout()`: synopsis + one identity sentence
(genre/director/cast, parts drop out when missing) + one stats sentence
(rating cited only when ≥20 real votes; runtime/seasons). **Upcoming titles
get future-only wording** ("scheduled to release on …" / "expected to
release in …") and never a reception claim. Verified live on Jawan
(released) and Mirzapur (series); enforced by tests.

## Recommendations

`relatedTmdb` (detail rails) and `/api/mood` (mood/quick-pick/homepage
pools) filter through `discoveryFilter` before anything reaches a visitor.
Trending keeps TMDB's data-driven order — the only intervention is dropping
Tier C. **Latest (revised after live verification):** a title qualifies with
`votes >= 10`, OR through the day-one rescue — `popularity >= 20` AND poster
AND real overview AND status released AND an exact release date within the
last 14 days. The rescue admits real day-one releases (verified case: a
major franchise film 24h old with 7 votes) while 1-vote junk (popularity
≈0–2), future titles, and old popular titles all stay out — each case
regression-tested. No new network calls anywhere.

## Regression testing

`npm test` — 20 tests, all passing: year 0 hidden; rating never NaN/0.0/
zero-vote; invalid runtime/cert hidden; release status matrix; upcoming
prose has no reception claims (banned-phrase asserts); released prose cites
only real ratings; missing cast never breaks prose; Bayesian ranking beats
the 10.0-from-2-votes case and excludes low-confidence titles; shrinkage
math; kind normalization; tier assignment; Tier C never in discovery +
no-blank-shelf guarantee; null poster contract; placeholder people hidden.

## Performance impact — Phase 1 untouched

No changes to: Cloudflare/OpenNext config, R2, cache TTLs, route
revalidates, pagination caps, Durable Objects, prefetch fix, headers. No new
fetches, no per-title queries, no generateStaticParams growth — every new
rule is an in-memory transform of data already fetched. Latest's TMDB discover call keeps its original
`vote_count.gte=1` URL (unchanged cache keys); all Latest eligibility is
decided in memory by `latestEligible`.
`next build` passes clean; route table unchanged.

## Data-source precedence (§15 policy)

1. **Supabase `movies` table** — curated CineTonight data, always wins for
   catalogue ids (dashboard edits are deliberate).
2. **`content/movies.json`** (shipped snapshot) — fallback when the row is
   missing/unreachable.
3. **Live TMDB** — external ids (`tmdb-m-…`/`tmdb-t-…`) and live rails only.
   Old Supabase rows lack `releaseDate`; `releaseStatus` falls back to the
   year, and the next `npm run sync` backfills it. Nothing overwrites
   curated data automatically.

## Remaining issues (deferred)

- **Phase 4 (SEO):** series under `/movie/` URLs (redirect plan); Tier C
  noindex rules; soft-404 status on `notFound()` pages (pre-existing note).
- **Phase 3 (UX):** "Movie Info & Details" heading says "Movie" on series
  pages; person pages could use the same factual treatment; optional
  admin "editorial paragraph" field (declined for now — factual-only chosen).
- `npm run sync` re-run recommended after deploy so Supabase rows gain
  `releaseDate` (works fine without it meanwhile).

## Success criteria — status

Year 0/null/NaN gone ✓ · Top Rated trustworthy ✓ · kind consistent ✓ ·
upcoming wording factual ✓ · reception claims gone ✓ · weak entries out of
discovery ✓ · long-tail searchable ✓ · recommendations filtered ✓ · missing
data fails gracefully ✓ · one reusable module ✓ · Phase 1 untouched ✓
