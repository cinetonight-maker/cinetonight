# CineTonight — Continue-From-Here Playbook

Written 1 Sep 2026, at the end of the V2 build phase. This is the single
document a new developer (or AI session) reads to take over. It says what
the product is, what is already built, the laws that must never be broken,
how to work safely, and the exact remaining tasks in order. Everything here
is current as of branch `v2`; when you change reality, change this file.

---

## 1. What this product is

CineTonight (cinetonight.com) answers one question: **"what should I watch
tonight?"** It is a decision engine, not a catalogue browser. Every page
exists to get a visitor from indecision to a confident pick, with honest
facts and honest availability. ~90% of traffic lands on movie pages, so the
movie template is the heart of everything.

The founder (Qaisar) is the only person who deploys, approves editorial
content, and makes product decisions. Sessions build on branch `v2`; the
live site runs older code until the one-flag launch (§7).

## 2. The laws (never break these — they are settled founder decisions)

1. **URL freeze.** Never create a new movie URL. New titles live on their
   `tmdb-m-<id>-slug` / `tmdb-t-<id>-slug` addresses, derived from TMDB's
   numbering. The 12 existing clean catalogue URLs stay forever; a removed
   catalogue entry must leave a redirect. The catalogue is a frozen VIP
   list — the sync's auto-add is retired (lib/sync.ts) and must stay dead.
2. **No thin pages, never crawled.** Any new page (Finder, collections,
   reset page…) is few in number, substantial in content, and
   `noindex` until it demonstrably earns indexing.
3. **No fake content.** Modules hide when data is missing. The sparse
   (Level-B) movie page is the deliberate default for ~24k long-tail
   titles. Nothing invents ratings, reviews, availability, or opinions.
4. **External ratings are never CineTonight scores.** TMDB ratings always
   carry the "external rating — not a CineTonight score" label.
5. **Cache cost rules.** `enableCacheInterception` stays `false`
   (request-loop incident). No new unbounded ISR surfaces. `/movie/[id]`
   stays SSG (3-day revalidate); `person/`, `blog/[slug]`, `[slug]` stay
   force-dynamic. Read `docs/CACHING.md` before adding ANY fetch to a
   cached route. History: an R2 cache misconfiguration once cost
   $70/month (2.79M objects). These rules are why it can't recur.
6. **Only the founder deploys.** The live site is frozen between launches.
7. Full decision history: `PROJECT_HANDOFF/10_DECISIONS_LOG.md` (repo) and
   `00_Project_Control/DECISIONS_AND_OPEN_QUESTIONS.md` (handover package,
   sibling folder `CineTonight_V2_Clean_Developer_Handover/`).

## 3. The content system (how pages get their intelligence)

Three layers — memorize this split:

- **Suggestions: fully automatic.** Moods, Quick Picks, "another pick",
  Also Consider, More Like This — the engine filters real TMDB data by
  rules (lib/moods.ts, lib/quickPicks.ts, /api/mood). No per-movie human
  work, ever. Client-side shuffle only; server randomness would split the
  cache.
- **Facts: fully automatic, every title.** About text, runtime, cast,
  series Commitment panel (lib/tmdb.ts `fetchSeriesFacts`), availability
  (JustWatch via TMDB, region-honest). Any randomly searched movie gets a
  complete, branded, factual page instantly. This is the Level-B page.
- **Opinions: auto-DRAFTED, human-APPROVED, never auto-published.**
  The Verdict, watch-if/skip-if, chips/tags (mood/pace/intensity/
  attention/vibe), What to Expect, Best For, and the CineTonight Take
  live in the `movie_intel` Supabase table (supabase/movie_intel.sql;
  read side lib/intel.ts). Rows carry `editor` + `reviewed_at` — a row
  without an accountable editor never renders. The workflow: AI drafts a
  batch grounded in real reception research → founder reads, edits, runs
  the SQL → those pages light up with the rich template. Batches 1–2
  (all 11 released catalogue titles) sit ready in
  `supabase/drafts-intel-batch-1.sql` / `-2.sql`; the founder runs them
  at deploy time. Never skip the human step: it is both the byline's
  honesty and the Google scaled-content-abuse defence. Vocabulary is
  controlled words (pace patient|steady|fast etc.), never numbers.

## 4. What is already built (branch `v2`, all verified)

Everything below passed: `tsc --noEmit` clean, 286/286 tests,
production builds with the flag on AND off, screenshot review.

- **One-flag theme/template system.** `NEXT_PUBLIC_V2_THEME=1` at build
  time adds `body.v2`; `app/v2-theme.css` swaps the purple tokens to the
  locked dark-red system. Launch = set the env in production and deploy
  once. Never make it per-visitor (ISR caches one variant).
- **All page families have their V2 layer:** homepage (fanned card-stack
  hero `HomeHeroV2`, chooser card, pick panel with Also Consider, guides
  layout, How-picks-work), Movie Detail (`components/v2/MovieDetailV2.tsx`
  — rich + sparse states per spec §5), Series (Commitment panel from real
  TMDB facts), Search (grouped + zero-result recovery), Person (factual,
  stays noindex), listings (`app/v2-listing.css` + `page--listing`),
  channels, blog, genres, everything else via tokens.
- **URL freeze implemented:** sync ADD retired; hero accepts any TMDB
  title (auto rotation writes tmdb ids for uncatalogued; admin Hero tab
  accepts pasted TMDB links; homepage resolves picks → slides → trending
  → cached `fetchTitle`). Homepage-tab hero picks bug fixed (they were
  written but never read).
- **Stabilization backlog:** STAB-01..06 fixed pre-V2. This session:
  STAB-07 (/tv-shows canonicalizes to /web-series — the founder's ranking
  page — and is out of the sitemap; both URLs live), STAB-08 (robots
  blocks only `/search?` queries so the bare page's noindex is crawlable;
  auth/list pages have noindex meta), STAB-09 (skip link + `<main>`
  landmark), STAB-10 partial (labels/autocomplete/aria on auth forms),
  STAB-12 (honest metadata; "100% legal" absolutes softened), STAB-13
  stage 1 (CSP **Report-Only** header in next.config.mjs).
- **Live duplicates: zero.** Each catalogued title's tmdb twin URL 308s
  to the clean URL; sitemap lists clean URLs only (verified live).
- **Design source of truth:** the "CineTonight V2" Claude-Design canvas
  (all boards incl. Catalogue Listing) + static exports in the handover
  package's `06_Design_References/V2_Design_Canvas_Mockup/`.
- **Docs:** `docs/V2-BUILD-PATH.md` (phase log),
  `docs/V2-PENDING-BEFORE-DEPLOY.md` (the deploy gate checklist — keep it
  updated), this file.

## 5. How to work on this project safely

1. Work on branch `v2`. Commit as
   `git -c user.name="Cine Tonight" -c user.email="officialcinetonight@gmail.com" commit …`.
2. Before every commit: `npx tsc --noEmit` && `npm test` (expect 286+)
   && `NEXT_PUBLIC_V2_THEME=1 npx next build`. For anything touching
   routes/caching also build with the flag off and confirm the route
   table (`/movie/[id]` must stay `●`/SSG).
3. Local preview: `NEXT_PUBLIC_V2_THEME=1` in `.env.local`, restart dev.
4. TypeScript is the Windows-native TS7 binary on the founder's machine —
   he re-runs `npx tsc --noEmit` there before release.
5. Don't touch `app/api/cron/*`, `/api/debug`, `/api/tv/[id]` thinking
   they're dead — they're external/template-called entry points.
6. `scripts/` holds one-off seeders (history) plus load-bearing
   `predeploy-check.mjs`, `sync-tmdb.mjs`, `r2-cleanup.mjs`.

## 6. Remaining tasks, in order (step-by-step)

### 6.1 Founder-gated, at deploy time
- Run intel batches: read `supabase/drafts-intel-batch-1.sql` and `-2.sql`,
  edit wording freely, paste into Supabase SQL editor, Run (upsert; safe
  to re-run). Avengers: Doomsday is deliberately absent until it releases.
- Full local preview sign-off with the flag on (checklist in
  `docs/V2-PENDING-BEFORE-DEPLOY.md`).

### 6.2 Password recovery (STAB-10 completion) — needs founder go-ahead
1. Founder configures the reset-email template in Supabase Auth settings.
2. Add ONE page (e.g. `/reset-password`), `noindex`, using
   `supabase.auth.resetPasswordForEmail` + the update-password flow.
   Generic success responses (no account enumeration), rate-limited.
3. Add a "Forgot password?" link on `/signin`. That's it — no extra pages.

### 6.3 CSP enforcement (STAB-13 stage 2) — after launch
1. Let the Report-Only header (next.config.mjs) observe real traffic for
   1–2 weeks post-launch; collect console violations on real pages
   (auth, player, search, admin).
2. Fix legitimate violations by narrowing code, not widening policy.
3. Rename header to `Content-Security-Policy`. Never add wildcards
   beyond the existing inventoried origins.

### 6.4 Guide entity links (STAB-11) — with the content pilot
The live guides name films with zero `/movie/` links. When editing posts
(admin Blog manager): link every centrally-recommended title to its
correct entity (catalogued → clean URL; else `tmdb-m-<id>-slug` — verify
the TMDB id + year, same-name traps are real, see Bleach/Dark Matter).
Never string-match titles at request time; links live in the post content.

### 6.5 Intel scale-up (the ongoing engine)
Batch workflow, repeatable forever: pick next titles by traffic priority
(Search Console) → research current reception (web) → draft rows in the
batch-SQL format (see batches 1–2 for tone: honest, specific, cautions
included, controlled vocabulary) → founder approves/edits/runs. Never
publish a row without founder review. Series rows also set
`episode_rhythm` + `hook_expectation`. `alt_id` only when a genuinely
comparable title exists; factual `alt_reasons` only.

### 6.6 Discovery Finder — the flagship remaining feature
Gated on intel mass (spec: `03_Product/Page_Specifications/
DISCOVERY_FINDER.md` + `07_Research/DISCOVERY_FINDER_RESEARCH_AND_
RECOMMENDATION.md` in the handover package). Rules when building: ONE
page, `noindex` until it earns indexing (law #2); filters draw only on
real data (facts + reviewed intel); reuse the /api/mood cost pattern —
closed filter space, client-side randomness only; no per-combination
URLs. Design first, founder approves, then build behind the flag.

### 6.7 Later stages (blueprint order, package `04_Roadmap/`)
Curated collections (individually published, quality-gated); Movies ≤90
Minutes page (ONE substantial page, noindex first); Stage 5 editorial
authority (typed article records, blog clusters); Stage 6 account
hardening; Stage 7 personalization; Stage 8 community — all deliberately
in that order. Trust-page redesign stays excluded (founder decision).

## 7. Launch runbook (when the founder says go)

1. Working tree clean; founder sign-offs in
   `docs/V2-PENDING-BEFORE-DEPLOY.md` all ticked (intel batches run,
   local preview approved, Windows tsc clean).
2. `npm test` → 286+/286. `NEXT_PUBLIC_V2_THEME=1 npx opennextjs-cloudflare build`
   → `node scripts/predeploy-check.mjs` → must print 4/4 ✓.
3. Golden-URL sweep on the built server: every existing URL 200 with
   unchanged canonical; junk paths 404; `/p/*` 308s. JS-off spot check on
   a movie page (identity + availability + links must render).
4. Set `NEXT_PUBLIC_V2_THEME=1` in the production environment;
   `npx opennextjs-cloudflare deploy`. The whole site flips to V2 in this
   single deploy. Zero URL changes.
5. Rollback = redeploy previous version (or unset the flag and deploy).
6. Post-launch watch (first 48h): Cloudflare R2 object count + request
   graphs (cost law), Search Console coverage (no new duplicate/thin
   URLs), CWV field data, the CSP Report-Only console noise (§6.3).

## 8. Where everything lives

- Repo: `cinetonight-site/` (branch `v2`). Sibling: the handover package
  `CineTonight_V2_Clean_Developer_Handover/` (blueprint, specs, research,
  design references; checksum manifest in `00_Project_Control/`).
- Supabase: catalogue (`movies`), CMS (`pages`, blog), `movie_intel`,
  auth. TMDB API for all live title data. Cloudflare Workers via
  @opennextjs/cloudflare; R2 incremental cache; D1 tag cache (CMS only).
- Design canvas: the founder's "CineTonight V2" artifact (Claude Design).
- The founder's standing preferences: minimal chat, log progress instead
  of long recaps; never deploy without his word; ask before reversing any
  settled decision — better yet, don't.

## 9. A letter to whoever picks this up

I built most of V2 in a few intense days alongside the founder, and this
is what I'd tell you over coffee before handing you the keys.

**Trust the comments.** This codebase explains itself deliberately.
Every strange-looking rule — the closed filter space on /api/mood, the
force-dynamic catch-all, the build-time-only theme flag — is a scar from
a real incident, and the comment next to it tells you which one. If a
rule seems dumb, read its comment before "fixing" it. The $70/month
cache bill and the request-loop outage both happened because someone
didn't have that comment yet.

**Honesty is the product, not a constraint.** It will be tempting to
fill the sparse pages, auto-generate the verdicts, promise availability
you haven't verified, or blur the TMDB rating into a house score. Every
one of those moves reads as growth for a month and then costs the site
its one real asset: being the place that doesn't lie about what to
watch. Modules hide without data ON PURPOSE. A page that says less and
means it beats a page that says everything and means nothing.

**The founder is the editor. Work with that, not around it.** Qaisar
approves every published opinion, decides every deploy, and prefers
short direct communication over long reports — log your progress in
docs, keep messages brief, and never touch the live site or reverse a
settled decision without asking. He moves fast when things are shown to
him working (screenshots, local previews) and he will tell you plainly
when something isn't what he wants. Show, don't lecture.

**The order of work matters more than the amount.** TTFB fix before
content pushes. Intel before mood pages. Mood pages before the Finder.
Freshness cadence before chasing head keywords. The strategy doc
(07_Research/FULL_AUDIT_AND_STRATEGY_2026-09-02.md) explains why each
gate exists — the short version is: speed multiplies everything,
content justifies surfaces, and surfaces earn indexing.

**When in doubt, the answer is already written down.** Between this
playbook, the decisions logs, the pending-before-deploy checklist and
the strategy doc, almost every question you'll have in your first month
has an answer with a date and a reason next to it. The project's memory
is in the folder — use it, and keep it current for whoever comes after
you.

Take care of it. It's a small site with an unusually solid spine, a
founder who knows exactly what he wants it to be, and a real gap in the
market waiting for it. — Claude (Fable 5), 2 Sep 2026
