# 10 — Decisions log

**Purpose: stop a new account undoing settled decisions or repeating dead
experiments.** Dates are from commits, docs or the 25-26 August session.

---

### Rebrand MOVIEX → CineTonight · 14 Aug 2026
Commit `39db5f1`. **Status: done.** MOVIEX still visible on stale pages (P2).

### Migrate Vercel → Cloudflare Workers · 15 Aug 2026
Commits `5cde30e`, `82babd7`. Bundle ~6.4 MB gzipped exceeds the Workers Free
3 MiB limit, so Workers Paid is implied. **Status: done, live.**

### Disable `enableCacheInterception` · 20 Aug 2026
**Reason:** root cause of the RSC prefetch loop. **Alternative considered:**
keep it for the CPU saving. **Choice:** disabled; CPU is pennies here.
**Status: permanent. `predeploy-check.mjs` fails the build if re-enabled.**

### Person pages → `noindex, follow` + `force-dynamic` · Phase 4A
**Reason:** 46% of the indexed sample, least differentiated content, and an
unbounded id space that grew R2 to 2.79M objects. **Alternative considered:**
robots.txt Disallow — **rejected**, because a disallowed URL is never crawled,
so Google never reads the noindex and the URLs sit in the index indefinitely.
`follow` kept so credit flows to movie pages.
**Status: live. Expect indexed count to fall — that is the plan working. DO NOT REVERSE.**

### Remove person pages from the sitemap · Phase 4A
Submitting a noindex URL is a contradiction GSC reports as an error.
**Status: live, verified — 0 `/person/` URLs in the live sitemap.**

### Cap the sitemap's live-TMDB batch at 150 · Phase 4A
**Reason:** advertising every live-TMDB page invited crawl storms.
**Status: live.**

### Do NOT expand the sitemap to the ~24k long tail · 26 Aug 2026
**Owner's decision**, in his words: TMDB has millions of movies, focus the
sitemap on our own pages and let Google handle movie pages on its own, as it
already found 24k. **Alternatives considered:** 500 / 1,000-1,500 / a
Supabase-backed list of discovered ids. **Choice: none — keep as is.**
**Status: settled. Do not re-propose without new evidence.**

### Blog and `/[slug]` → `force-dynamic` · Phase 4B-2
Invented slugs persisted one 77KB+ R2 object each on an unbounded space.
**Status: live.**

### Path guard in middleware · Phase 4B-2
Validation must precede rendering, because the R2 write happens because the
route rendered. Rejects only what cannot be real.
**Status: live.**

### Redirects created disabled, 307 first · Phase 4B-3
Promote to 308 only after verifying the destination. A rule that went live
instantly could take a real page off the site.
**Status: live. Used successfully for `/contact-us` → `/contact`.**

### Articles start at `##`, never `#` · 23 Aug 2026
The checklist previously demanded the opposite, which is how four live posts
showed their title twice. **Status: enforced; `import-page.mjs` now blocks it.**

### Server-render Where to Watch, region = US · 26 Aug 2026
**Reason:** `/api/watch` is robots-disallowed, so ~24k pages showed crawlers a
loading message. **Alternatives:** unblock `/api/` (rejected — reopens the
compute cost); bake IN (rejected — the measured winners were Western titles and
TMDB's US coverage is denser). **Owner chose US.**
**Status: built, NOT deployed.**

### Pin the SSR providers fetch to a 72h TTL · 26 Aug 2026
**Reason:** at the normal 24h TTL it would have dropped movie pages from 72h to
24h — 3x regenerations and R2 writes. **Alternative:** accept 24h for fresher
data. **Owner chose the override.** Visitors still get 24h data via `/api/watch`.
**Status: built, NOT deployed.**

### Where to Watch shows 3 rows, rest behind "Show more" · 26 Aug 2026
Previously `buildWatch` hard-sliced to 3 and **discarded** the rest, hiding them
from the HTML crawlers read. Now capped at 8, three visible, all in the DOM.
**Status: built, NOT deployed.**

### Prime ranked first ONLY where it genuinely streams · 26 Aug 2026
**Owner proposed** pinning Amazon Prime to the top of every title with a
"Start 30 days free trial" button regardless of real availability, for future
affiliate revenue. **Rejected, and the codebase had already rejected it:**
`lib/watchRows.ts` carries a `streaming` guard added precisely because without
it "nearly every movie showed a Start Free Trial Prime strip for a title Prime
doesn't even include", and a comment explaining that a signup-page CTA "reads
as an ad and costs the panel its trust".
**Reasons:** no SEO upside; misleading `offers` markup is a manual-action
category; contradicts the site's own "we only show platforms confirmed to carry
a title"; breaks affiliate conversion and risks the Amazon programme.
**Final choice:** Prime sorts first among providers that genuinely stream the
title. **Owner accepted. Status: built, NOT deployed. Do not revisit.**

### Do not hardcode "30 days free trial" · 26 Aug 2026
Prime's trial length varies by country and changes. Link to Amazon's own page.
**Status: settled.**

### Author attribution: default + per-post override · 26 Aug 2026
**Both** options taken: a constant default (Syed Ahmad) **and** a database
column with an admin picker. **Status: built; SQL run by the owner; NOT deployed.**

### `author` added to `blog_posts` only, never `blog_revisions` · 26 Aug 2026
`blog_revisions.author` already means "the admin email who saved this
revision". Reusing the name would leave two incompatible meanings behind one
column. **Status: settled; the reasoning is in the SQL file.**

### `MIN_VOTES.year` 1 → 25, filtered at the TMDB query · 26 Aug 2026
**Alternative:** apply `discoveryFilter` after fetching — **rejected**, it makes
page sizes ragged. **Status: built, NOT deployed.**

### Delete `app/movie/[id]/loading.tsx` rather than a route-group move · 26 Aug 2026
The route-group proposal in `docs/SEO-PHASE-4B-1.md` was untested speculation.
Deletion is the proven fix, already used on blog and person.
**Status: deleted by the owner, NOT deployed.**

### Cloudflare Rule 3: remove `/movie/tmdb-` · 26 Aug 2026
It blocked every AI crawler from the long tail (69,410 events) while robots.txt
allowed them. **Status: DONE by the owner, live.**

### Cloudflare Rule 4 deleted · 26 Aug 2026
Blocked ClaudeBot on all paths except `/robots.txt`, contradicting robots.txt.
Rule 3 already covers the paths worth protecting. **Status: DONE, live.**

### `picsum.photos` removed from `next.config.mjs` · 26 Aug 2026
Verified safe first — the owner ran a query returning zero rows.
**Status: built, NOT deployed.**

### Meta descriptions trim on word boundaries · 26 Aug 2026
Replaces `.slice(0, 158)` across movie, blog, channel, free-movies and the
three admin SERP previews. **Status: built, NOT deployed.**

### Batch the deploy rather than ship incrementally · 26 Aug 2026
**Owner's choice.** **Status: still pending as of 31 August.**

## Decisions explicitly NOT made

- Whether anyone will maintain the OTT release-date posts weekly (blocks the hub)
- The fate of the expired weekend post
- Anything about V2
- Whether to add author `sameAs` links (no real profile URLs supplied)

## 2026-09-01 — URL FREEZE (founder decision, FINAL)
Never create a new movie URL again — no new clean slugs, no catalogue auto-adds. New titles live on tmdb-m-*/tmdb-t-* addresses. Existing clean URLs stay and are never removed without a redirect. Featuring a title (hero etc.) never requires cataloguing it. Full text in the handover package 00_Project_Control/DECISIONS_AND_OPEN_QUESTIONS.md.

## 2026-09-02 — Unreviewed-content fallback tier ("quick take"), founder decision — NOT YET BUILT
For the long-tail titles with no human-reviewed `movie_intel` row: instead of
inventing an opinion and presenting it as editorial, or leaving pages fully
sparse forever, add an automated fallback tier (grounded in real per-title
signals, not generic filler) that is honestly labeled as automated/not yet
reviewed — visually and structurally separate from the reviewed
Verdict/CineTonight Take, never implying human authorship. Reviewed intel
replaces it automatically once a title is actually reviewed.
**Why not the first version of this idea (AI content shown as if human,
swapped later):** false human-authorship risks both a Google scaled-content
manual action across the whole domain (not just those pages) and undermines
the core V2 differentiator — an accountable named editor is the one thing
algorithms/competitors can't copy. Honest labeling avoids the false-attribution
risk but does NOT by itself clear Google's scaled-content-abuse policy, which
targets content generated at scale primarily to manipulate rankings regardless
of AI disclosure — so this still needs to ship gated (noindex first, measured,
grounded in real signals, not blanket across the full long tail on day one),
the same way every other new surface in this project has shipped.
**Status: decided in direction, NOT built, NOT scheduled.** Founder asked to
be reminded to review this in detail, line by line, before this part is
actually touched/implemented — do not build without re-confirming scope with
him first.

## 2026-09-02 — V2 HOMEPAGE LOCKED (founder decision)
The V2 homepage is final as of this date. No further design or layout work on
it without an explicit new decision. What it locks:

- **Answer first ordering**: hero -> Your pick for tonight -> mood card ->
  Quick Picks -> trending -> streaming -> explore -> guides -> watchlist ->
  newsletter. Deviates from the design canvas (which put both choosers above
  the pick) on purpose: the recommendation is server-rendered, so it already
  exists for a visitor who taps nothing, and two choosers stacked above it
  asked people to decide how to decide before showing them anything.
- **Region-aware recommendations**: two audience buckets (IN = South Asia,
  GLOBAL = everyone else) blended into the mood/Quick Pick pools and the
  homepage seed. Closed set, edge-cacheable, no per-visitor rendering.
- **Refine your picks** panel: time, watching-with, films/series. Country
  deliberately excluded (availability is resolved per title, and a country
  dimension here would break the closed-cache design).
- **No-repeat memory**: 30 titles, per browser, cleared with the tab.
- **Explained picks**: the "why this fits" line names the genres a title
  actually matched on. Honesty contract covered by tests/whyItFits.test.mjs.
- **No em dashes anywhere in user-visible text** (site-wide rule, not just
  the homepage). Movie page titles and the brand suffix changed with it.
- **--accent-d is a fill, never type**: it measures ~2:1 on the dark cards.
  --accent-link (#ec5a63) is the readable brand red for text.

Known and accepted: nothing here has been visually verified — no build
environment was available in the session that produced it. Verified by the
test suite (303 passing), syntax checks, and code review only.
