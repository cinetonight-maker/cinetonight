# Phase 3 — Homepage & Discovery UX: final report

**Status: APPROVED / COMPLETE / FROZEN LOCALLY (20 Aug 2026). NOT
DEPLOYED.** Deploys bundled with Phase 2 after the Phase 1 green window.
No blanket cache purge (targeted purge only if a proven stale-edge issue).

## A. Before vs after

The homepage was already a decision engine (this session's earlier
redesign), so Phase 3 was surgical, not a rewrite. What changed for a
visitor: the mood grid speaks in feelings (Happy, Stressed, Need a Laugh…)
instead of genre nicknames; Quick Picks are a tight six; Explore Tonight
switched from generic Films/Series/New/Top tabs to industry tabs with a
globally mixed default tab labelled "Tonight Mix" (not "For You" — the feed
is a shared blend, identical for every visitor, and the UI must not imply
personalization that does not exist; internal id stays `for-you`) — the single biggest fix for the Hollywood-heavy
feel; the nav is shorter and consistent ("Series", "Guides", new
"Discover"); and the Free Classics shelf moved off the homepage (feature
untouched at /free-movies).

## B. Final section order (locked §3) — implemented exactly

Hero/Smart Picker → Quick Picks → Choose Your Mood → Tonight's Pick →
Trending Tonight → Browse by Streaming Service → Explore Tonight → What to
Watch Guides → My List → Newsletter → Footer. No extra shelves.

## C. Diversity (§14, §16)

New `lib/industry.ts`: `industryOf()` classifies with this precedence
(never from title text; simple and deterministic):

1. Hindi → Bollywood (never Hollywood, even with US metadata)
2. Telugu / Tamil / Malayalam / Kannada → South Indian
3. Korean → Korean
4. English + known US origin → Hollywood
5. English + known non-US origin (GB, AU, IN, …) → International
6. English with no usable origin-country metadata → Hollywood (the
   documented fallback: TMDB movie LIST results often lack country
   metadata — only TV list hits expose `origin_country` and only detail
   fetches expose `production_countries` — and no N+1 per-title detail
   requests are introduced just to classify)
7. Everything else → International

Both ISO codes ("HI") and English language names ("Hindi") are handled.
Region/language-biased TMDB pools remain the primary shelf-building
mechanism; the classifier mixes/labels titles we already have.
`mixDiscovery()` (rewritten in the
correction pass): largest-remainder apportionment sums quotas to EXACTLY
the target (the earlier per-category Math.round could inflate big quotas
and silently zero Korean AND International — caught in audit, regression-
tested now); every non-empty category is guaranteed ≥1 slot; output is
PROPORTIONALLY INTERLEAVED so any display prefix keeps the mix (the
homepage builds 10, the grid shows 8 — both small categories provably
survive inside the 8). Measured result with rich pools: 4/2/2/1/1 at
n=10. Tier C is dropped (backstop on top of caller-side discoveryFilter),
shortfalls fill from stronger pools, deterministic, deduped. Trending stays 100% data-driven and
unbalanced, labelled "Trending Tonight" with the honest TMDB subtitle.

## D. Quick Picks (locked six)

date-night (romantic mood, rating ≥7) · short (film <90min) · feelgood
(happy mood) · family (happy mood, ≥6.5, film) · hidden-gem (≥7.5, <1,500
votes) · highly-rated (≥8). All feed the SAME engine (/api/mood, closed
param set); Late Night and Mind Bending removed. Criteria text remains the
factual source for "why it fits".

## E. Moods (locked eight)

happy · romantic · relaxed · stressed · excited · need-a-laugh · dark ·
thoughtful — each mapped onto the EXISTING tiered genre engine (no second
engine). "Stressed" is deliberately the softest recipe (comfort viewing,
heavy drama excluded). "Surprise Me" survives internally (`SURPRISE`,
`ALL_MOODS`) because three Quick Picks are genreless — it no longer renders
in the grid. /api/mood validates against ALL_MOODS: closed cache-key space
(9 ids).

## F. Tonight's Pick

Unchanged architecture (already compliant): one recommendation at a time,
server-seeded, client shuffle for Another Pick (no random cache keys, no
R2 writes per click, no immediate repeats via seed-tail shuffle), factual
whyItFits() from selected criteria only, provider data fetched ONLY for
the selected title, trailer click-to-load, watchlist without login,
Ticket surfaced after the pick below Where to Watch/Another Pick.

## G. Navigation (§19–20)

Top nav (locked order, labels only — zero URL migrations): Movies, Series
(/web-series), Trending, Discover, Guides (/blog), My List. Follow Us and
Free Movies moved out of the header (footer/drawer keep them reachable).
Sidebar trimmed to Home, Discover, Search, Movies, Series, My List — each
icon has title tooltip, aria-label, and aria-current. "Series" is the
standard visible term; the separate /tv-shows route keeps its drawer label
pending the Phase 4 route consolidation (documented).

## H. Explore Tonight (§15)

One component, six locked tabs. The default "Tonight Mix" tab (id `for-you`) is server-blended into
the cached homepage HTML (zero client fetches). The five industry tabs
lazy-load on first click from NEW `/api/explore?tab=…` — tab validated
against a closed set of exactly 5 values (400 otherwise), rate-limited,
Tier-filtered server-side, edge-cache headers identical to /api/mood.
Verified in a real browser: one tab click = exactly ONE request; no
all-tab prefetch. New pool helper `southIndianTmdb` (Telugu+Tamil merged).

## I. Mobile (§23)

Verified at 375px: compact header (no sidebar), hero short with the
primary CTA well above the fold, Quick Picks 2-column, moods 3-column,
Tonight's Pick stacks vertically, Trending stays a swipe rail, tabs are
finger-sized, bottom tab bar = Home/Search/Movies/Series/My List, no
horizontal overflow (scrollWidth == viewport at 375/800/1024/1160/1280
re-verified after changes).

## J. Performance (§26, §32)

Measured with headless Chromium against the production build:
- Initial homepage requests: **44** (previous build measured 29–49 across
  runs; same band — includes the new /discover prefetch).
- One Explore tab click → **1** API call; picker → **1** /api/mood call.
- **Idle growth over 30s after interactions: 0 requests** — no loops.
- Server data calls, CORRECTED after code audit: BEFORE Phase 3 the
  homepage made 2 Supabase reads + 1 TMDB request (global trending; plus 2
  long-cached shared genre-map URLs). AFTER: 2 Supabase + 9 distinct TMDB
  URLs — trending(1) + Bollywood pool (movie+tv discover = 2) + South
  Indian pool (Telugu movie+tv + Tamil movie+tv = 4) + Korean pool (2).
  All 9 are FIXED URLs in the shared fetch cache on the existing 6h TMDB
  TTL: across a whole window each is fetched once for ALL visitors
  combined, and the cache-key space is closed. No R2/Cloudflare/TTL/config
  changes; no new unbounded fetches; generateStaticParams untouched.

## K. Phase 2 integration (§29)

Every new surface passes Phase 2 filters: /api/explore → discoveryFilter;
Tonight Mix → discoveryFilter per pool + Tier-C backstop inside
mixDiscovery (regression-tested: a Tier C record cannot enter the mix);
/api/mood unchanged (already filtered). No weaker filtering was recreated
anywhere; Bayesian Top Rated, latestEligible, normalizeKind untouched.

## L. Accessibility (§25)

Mood tiles & Quick Picks: aria-pressed + check-icon selected state (not
color-only) — pre-existing, preserved. Explore tabs: role=tablist/tab/
tabpanel with aria-selected. Sidebar icons: tooltip + aria-label +
aria-current. Kind toggle: aria-pressed. Trailer/provider/watchlist/ticket
controls keep their existing labels. Keyboard focus styles unchanged
(:focus-visible rules already site-wide).

## M. Files changed

New: `lib/industry.ts`, `app/api/explore/route.ts`, `app/discover/page.tsx`,
`tests/industry.test.mjs`. Modified: `lib/moods.ts` (locked 8 + SURPRISE/
ALL_MOODS), `lib/quickPicks.ts` (locked 6), `lib/tmdb.ts`
(southIndianTmdb), `app/api/mood/route.ts` (ALL_MOODS), `app/page.tsx`
(mixed pools, ClassicsRow off), `components/home/ExploreTabs.tsx`
(rewritten for locked tabs), `components/Sidebar.tsx` (NAV flags + a11y),
`components/Header.tsx` (topOrder sort), `components/Icon.tsx` (compass),
`app/globals.css` (Discover hub styles), `tsconfig.json`
(allowImportingTsExtensions, needed by the dependency-free test runner).

## N. Tests & build

`npm test`: **29/29 pass** (20 Phase 2 + 9 Phase 3: classifier language
precedence; origin-country precedence for English — US → Hollywood,
GB/AU/IN → International, no-country fallback → Hollywood; definitive
languages beat country data incl. "Hindi never classifies as Hollywood";
mix ratios with BOTH Korean and International guaranteed present;
display-prefix survival of small categories; junk-fill protection;
dedupe/determinism; locked mood set; locked quick-pick set with valid
mood references). `tsc --noEmit`: clean. `next build`: clean;
/discover static (1d ISR), /api/explore dynamic. Functional flow verified
in a real browser: pick → recommendation, tab lazy-load, no loops.

## O. Deferred

- **Phase 4 (SEO):** /web-series vs /tv-shows route consolidation; series
  under /movie/ URLs; industry-level browse pages (Explore "View all"
  currently points at existing controlled pages); Tier C noindex; mood
  landing pages.
- **Phase 5 (detail pages):** provider/trailer UX depth.
- **Phase 6 (editorial):** guide strategy; the homepage Guides block
  currently reuses existing cached blog data unchanged.
- **Later:** Movie Match / Mixer (nav + /discover hub leave room for it);
  Studio/franchise pages; Right Now pages; Malayalam/Kannada expansion of
  southIndianTmdb (one-line change).
- **Decision to confirm:** Free Classics shelf removed from the homepage
  per the locked structure — restore is one line if you want it back.
