# 08 — V2 master plan

## Read this first

**There is no V2 plan.** This is not an omission in the handoff — no V2
architecture, scope, roadmap or feature set has ever been discussed or recorded.

The **only** reference to V2 anywhere is the owner's message on 31 August 2026:

> "is there anything important to do or i can deploy and then we will go
> toward the v2 of our product"

That is the entire established basis. `grep -ri "V2"` across `docs/`, `lib/`,
`app/` and `content/` returns nothing relevant.

**Do not fabricate a V2 plan and do not present one as previously agreed.**
If the owner wants V2 defined, that is a fresh design conversation.

---

## COMPLETED

Nothing under a V2 banner. The work completed to date is production work on V1,
catalogued in `15_PROJECT_TIMELINE.md` and `09_CURRENT_PROBLEMS_AND_FIXES.md`.

## IN PROGRESS

Nothing V2. Eight V1 changes are built and awaiting deploy — see
`12_CURRENT_DEPLOYMENT_STATE.md`.

## PLANNED

Nothing V2 has been planned.

## IDEAS (V1 backlog, not V2, and none of these are commitments)

Carried from the last session's open list:

- In-body links from articles to individual movie pages (the highest-value
  content item; a URL-verification script would be built first)
- Thicken or merge the two remaining thin OTT posts
- Decide the fate of the expired weekend post
- Channel pages are thin — ~350 words plus a grid, across 15 pages, on
  high-intent "what's on Netflix" style queries. Real opportunity, needs writing.
- Off-site brand presence: directory listings, film communities
- Add `sameAs` profile links for both authors once real URLs exist
- Standardise feature-image hosting (currently split Supabase/TMDB)
- A "New OTT Releases in India" hub — proposed, never approved, and contingent
  on someone committing to weekly updates

## PRODUCT FEATURES THAT ALREADY EXIST (do not mistake these for V2 plans)

The handoff brief asked about discovery, runtime, mood, genre and similar-movie
discovery as if they were V2 features. **They are already live in V1:**

- Mood discovery — `lib/moods.ts`, `/api/mood`, homepage "Choose Your Mood"
- Quick Picks including **"Under 90 Minutes"** — `lib/quickPicks.ts`
- Genre discovery — `/genres`, `/movies?genre=`
- Similar movies — TMDB recommendations on every movie page
- Search — `/search` plus `/api/search`
- Discovery hub — `/discover`
- Tonight's Pick — homepage, `/#tonights-pick`
- Streaming service discovery — 15 channel pages

Any V2 work on these is an **enhancement of a shipped feature**, not a new build.

## UNKNOWN

- V2 goals, scope, timeline, architecture
- Whether V2 means a redesign, a rebuild, a feature expansion, or a rebrand
- Personalization — never discussed
- Performance goals — no targets set
- Recommendation system changes
- Any V2 SEO architecture

## Recommended first step if V2 begins

Do not start building. Establish, with the owner: what problem V2 solves that
V1 does not, what stays, what changes, and what success looks like. Then write
this document properly.
