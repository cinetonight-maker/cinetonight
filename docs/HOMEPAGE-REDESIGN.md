# Homepage redesign — final report

**Date:** 18 August 2026
**Scope:** `/` only, plus the shared code the homepage forced us to touch.
**Status:** built, type-checked, smoke-tested locally, synced to the project folder. **Not deployed.**

---

## 1. What the homepage is now

A decision engine, not a catalogue.

The old page answered "what do you have?" with about a dozen shelves. The new
page answers "what should I watch tonight?" and tries to end the visit at a
title, not extend the scroll.

Order, top to bottom:

1. **Hero** — the question as the H1, two primary actions, search, crawlable
   category links, poster artwork.
2. **Quick Picks** — 8 one-tap starting points (Date Night, Under 90 Minutes,
   Feel Good, Highly Rated, Family Night, Hidden Gem, Late Night, Mind Bending).
3. **Choose Your Mood** — the 8 existing moods.
4. **Your Pick for Tonight** — ONE recommendation, with a factual "why this
   fits", where to watch, trailer, watchlist and full details.
5. **Trending Tonight** — one rail.
6. **Browse by Streaming Service** — 8 platforms.
7. **Explore Tonight** — one tabbed block (Films / Series / New Releases / Top Rated).
8. **Free Classics** — the one shelf unique to this site.
9. **What to Watch Guides** — 3 blog posts.
10. **My List** — a "come back to this" block.
11. **Newsletter.**

Everything above Trending exists to reach a decision. Everything below it is
support. The rule is written into the top of `app/page.tsx` so it survives.

## 2. Cost — the headline number

**The homepage makes exactly ONE TMDB request.**

One global trending call feeds the hero artwork, the seed recommendation, the
"Another pick" pool, the trending rail and both default Explore tabs. Quick
Picks, moods and the streaming row are static configuration and fetch nothing.

| | Before | After |
|---|---|---|
| TMDB requests per homepage render | ~16 | **1** |
| Cache entries written per render | 16 data + 1 page | **1 data + 1 page** |
| Homepage HTML | 183.6 KB | **170.0 KB** |
| RSC payload | 76.9 KB | **64.9 KB** |
| Cast objects serialised to the browser | 12 full cast lists | **0** |

The old "rich" streaming cards alone made 8 TMDB calls per render for decorative
poster fans nobody clicked. They are gone.

## 3. Nothing a visitor clicks can create a cache entry

This was a hard design constraint, because it is what made the site expensive.

- Quick Picks and moods call `/api/mood`, which is `force-dynamic` — it writes
  no page-cache entry.
- The discover queries behind it come from a **closed set** of mood × clamped
  filter combinations. Every numeric value is clamped server-side against an
  allow-list (`ALLOWED_RUNTIME`, `ALLOWED_RATING`, `ALLOWED_MAX_VOTES`), so
  nobody can mint unlimited cache entries by editing the query string.
- "Another pick" walks the pool already in memory. No refetch, no new cache key,
  and deliberately **no randomness in anything the server sees** — randomness
  fragments the cache.
- Explore tab state is local React state. It never touches the URL, so no filter
  combination can become crawlable inventory.
- Where to Watch is queried only for the title actually on screen, never for a
  shelf of titles nobody asked about.
- My List is read on the **client**. Nothing user-specific is read during server
  rendering, so the homepage HTML stays one shared cache entry for everyone.
  Personalising it at render time would have meant a cache entry per user.

## 4. Two bugs found and fixed on the way

### 4a. Four Quick Picks silently ignored their own filters

`/api/mood` routed any mood with no genres ("Surprise Me") to the plain trending
list — which applies **none** of `maxRuntime`, `minRating` or `kind`. That is
how "Under 90 Minutes", "Highly Rated" and "Hidden Gem" arrive.

So "Under 90 Minutes" could return a three-hour epic, and the page would print
*"Matched because you asked for a film under 90 minutes"* underneath it.

Fixed with `discoverPoolTmdb()` in `lib/tmdb.ts` — constrained discovery with no
genre filter. `/api/mood` now has three routes: mood-with-genres → mood pool;
mood-without-genres-but-with-constraints → constrained discover; unconstrained
"Surprise Me" → trending.

### 4b. Every page on the site was pinned to a 60-second revalidate

`lib/supabase/public.ts` wrapped anonymous Supabase reads in
`next: { revalidate: 60 }`. Next takes the **minimum** of a route's segment
revalidate and every fetch inside it, and the root layout reads site settings
through that client — so 60 seconds applied to the whole site and silently
overrode every longer TTL:

| Route | Configured | Actually was | Now |
|---|---|---|---|
| `/` | 900s | 60s | **15m** |
| `/movie/[id]` | 259200s (3 days) | 60s | **30m** |
| everything else | ISR | 60s | **30m** |

Every expiry is a re-render and every re-render is an R2 **Class A write**. A
crawler walking the site kept the entire route table rewriting once a minute.
This is very likely a significant share of the Class A volume that survived
rounds 1 and 2. Now 1800s — a 30× reduction in forced rewrites.

**How to check this in future:** run `npm run build` and read the *Revalidate*
column of the route table. That column is the truth; `export const revalidate`
is only a request. Written up in `docs/CACHING.md`.

**Trade-off accepted:** admin edits now appear within 30 minutes instead of 1.
The proper fix for instant publishing is an OpenNext tag cache (D1 or a sharded
Durable Object) — more infrastructure and more spend than the problem justifies
today. A deploy busts everything instantly regardless, because the cache key
includes `OPEN_NEXT_BUILD_ID`.

## 5. Honesty rules built into the code

The brief forbids fabricated ratings, reception and data sources. Three places
enforce that:

- **"Why this fits tonight"** (`whyItFits()` in `lib/quickPicks.ts`) is built
  ONLY from criteria the visitor actually selected, plus the TMDB score we
  actually hold. It states filters, never praise. With nothing selected it says
  so plainly instead of inventing a reason.
- **Every printed criterion now matches an applied filter.** Two did not:
  - *Hidden Gem* claimed "outside the most popular titles" with no popularity
    filter applied. Now genuinely filters on `vote_count.lte=1500` and says
    "with fewer than 1,500 TMDB votes".
  - *Family Night* claimed "a family-friendly film". We hold no certification
    data, so that was unsupportable. The label is the occasion; the criteria now
    state the actual filter — "a film with no horror, crime, war or thriller,
    rated 6.5 or higher".
  - *Late Night* and *Mind Bending* criteria were incomplete versus their mood
    genres; both corrected.
- **Stale-result honesty.** If `/api/mood` fails, the previous title stays on
  screen rather than blanking the section — but the page stops claiming it
  matches the selection. The "Based on…" subtitle reverts, the "why" reverts to
  the neutral line, and a visible notice says the suggestion could not be
  loaded. Verified in the browser.

## 6. SEO

- **One H1**, and it is the search intent itself: *"What should you watch tonight?"*
- The hero, Quick Picks, moods, the seeded recommendation, the trending rail,
  the streaming row, both default Explore tabs, the classics and the guides are
  all in the **server-rendered HTML**. The page is fully useful and fully
  crawlable with JavaScript disabled.
- Crawlable internal links to Movies, Series, Trending, Free Classics, all 8
  channel pages, `/genres`, `/blog` and `/my-list`.
- The hero buttons are real anchors with real `href`s — they work without JS.
- Canonical `/` unchanged. Tab state never enters the URL, so no thin duplicate
  URLs are created.
- Decorative poster artwork is `aria-hidden` with empty `alt`, so it adds no
  keyword noise.

## 7. Accessibility

Every section has `aria-labelledby`. Quick Picks and moods are toggle buttons
with `aria-pressed`. Explore is a proper `tablist`/`tab`/`tabpanel`. The stale
notice is `role="status"`. Focus rings on every interactive element. A
`prefers-reduced-motion` block disables the hover transforms.

## 8. Admin features affected — needs your decision

The redesign removed two things the dashboard still exposes:

- **Hero Slides** — *preserved.* The old rotating hero carousel is gone, but the
  homepage now uses your Hero Slides picks for the hero poster artwork, falling
  back to trending when fewer than 3 resolve. The Sync Center auto/manual hero
  mode still means something. No extra request: both reads were already happening.
- **Rows** — *now inert.* The Rows tab configured the dozen catalogue shelves,
  and the new homepage deliberately does not render them. The tab still appears
  in the dashboard but controls nothing. Tell me which you want:
  1. remove the Rows tab, or
  2. repurpose it to control which Explore tabs appear, or
  3. leave it for now.

  `scripts/prune-home-rows.mjs` is no longer needed either way.

## 9. Dead code removed

`components/Hero.tsx`, `components/MoodRoulette.tsx`,
`components/ChannelCardRich.tsx` — all three unreferenced after the redesign.

Deleted in the working copy. **The bridge cannot delete files on your machine**,
so please delete those three yourself. Leaving them costs nothing (they are
unimported, so they are tree-shaken out of the bundle and still compile).

## 10. Verification performed

- `npx tsc --noEmit` — clean.
- `npm run build` — clean, no warnings.
- `npx opennextjs-cloudflare build` — clean. Worker bundle 5.8 MB, assets 1.6 MB.
- 14 routes smoke-tested against `next start`: all 200 (`/pricing` 308, an
  existing intentional redirect).
- Playwright at 1440×900 and 390×844, full-page screenshots reviewed.
- No React errors and no page errors in the console. The only console noise is
  sandbox-specific: the TMDB image CDN is unreachable here, and the Vercel
  analytics scripts 404 under `next start`.
- Interaction tested: Quick Pick click, Explore tab lazy-load (8 cards from
  `/api/browse`), and the stale-result path.
- All 16 channel logos confirmed present on your machine and resolving.

**Not verifiable from here:** anything needing live TMDB or the real domain —
the actual recommendations returned, real poster artwork, the production
soft-404 behaviour, and the R2 Class A effect of the revalidate fix.

## 11. Responsive

Desktop is a 2-column hero with 4-across Quick Picks and 8-across moods. At
1240px it steps to 3 / 4 / 3. At 1100px the hero goes single-column and the
poster fan is dropped rather than pushing the decision UI below the fold. At
760px Quick Picks go 2-across, moods 3-across, the pick card stacks, and the
buttons go full-width.

## 12. Files changed

**New (8):** `lib/quickPicks.ts`, `lib/analytics.ts`,
`components/home/{HomeHero,HeroActions,PickStudio,StreamingRow,ExploreTabs,MyListPreview}.tsx`

**Modified (8):** `app/page.tsx` (rewritten), `app/globals.css` (+~200 lines),
`app/api/mood/route.ts`, `components/BlogSection.tsx`, `lib/tmdb.ts`,
`lib/types.ts`, `lib/supabase/public.ts`, `docs/CACHING.md`

**Deleted (3):** `components/{Hero,MoodRoulette,ChannelCardRich}.tsx`

## 13. Small fix included

`--panel` and `--text` were referenced by older CSS (`.faqitem`, `.w2w__*`) but
never defined, so those rules were silently falling back to transparent and
inherited colour. Both are now aliased in `:root`.

## 14. Deploy note

Deploying invalidates the whole R2 cache generation, because the cache key
includes the build ID. Batch this with the other pending work — the canonical
301, the noindex restore — rather than deploying it alone.

## 15. What to watch after deploy

1. R2 **Class A** at 6 hours and again on a clean 24-hour window. The revalidate
   fix should show up here more than anything else we have shipped.
2. The homepage in Search Console — the H1 and intent have changed.
3. `/api/mood` error rate. If the recommendation section is showing the stale
   notice often, TMDB is rate-limiting and the constrained discover queries need
   a longer TTL.
