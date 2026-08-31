# START HERE — new Claude account onboarding

**You are joining an existing CineTonight project. Do not treat this as a new project.**

Written 31 August 2026. Everything below is grounded in the project files and a
recorded working session dated 25-26 August 2026. Anything not established by
those two sources is marked **UNKNOWN** rather than guessed.

---

## What CineTonight is

A film and series **discovery and decision** platform at **https://cinetonight.com**.
It helps a visitor decide what to watch, then shows where that title is legally
streaming in their country. It is **not** a streaming host, not a piracy site,
and not an IMDb-style database.

Launched **14 August 2026**. It is roughly two weeks old.

## The single most important fact

**Movie pages are the SEO asset.** Not the blog, not the homepage.

In one measured Search Console period: ~57,000 impressions, ~350 clicks, of
which **306 clicks came from movie pages** and only **9 from the homepage**.
Do not reprioritise toward the blog. The blog exists to support movie pages.

## Current state in one paragraph

The site is live and technically healthy. Around 24,000 pages are indexed,
overwhelmingly movie pages. Traffic ran at roughly 170 clicks/day, then
collapsed around 23-25 August to about 3 clicks/day. A full investigation found
**no technical cause** — see `09_CURRENT_PROBLEMS_AND_FIXES.md`. The working
conclusion is a new-domain visibility correction, not a fault.

## What is NOT deployed

**Eight code changes are sitting uncommitted and undeployed** in the working
tree as of 31 August. They were built on 26 August, verified with `tsc`, a full
OpenNext build and `predeploy-check.mjs` 4/4, and then deliberately held so
they could ship as one batch. See `12_CURRENT_DEPLOYMENT_STATE.md`.

**The last actual production deploy was 22 August 2026, version `8682b8f8`.**
Two commits landed after it and were never shipped.

## What must NOT be changed without evidence

- `enableCacheInterception` must stay `false` in `open-next.config.ts`
- The `revalidations` table in D1 — if D1 is recreated, re-run `d1/tag-cache-init.sql`
- Do not add `loading.tsx` to any route using `redirectOrNotFound`
- Do not make per-path database queries (unbounded cache objects)
- Do not put an H1 in a blog or page body — the template renders the title as H1
- Do not point `visitorRegion()` at `/movie/[id]` — it reads headers and would kill ISR
- Do not invent internal URLs or movie IDs

## Reading order

READ THESE FIRST:
1. `01_PROJECT_MASTER_CONTEXT.md`
2. `02_CURRENT_SITE_STATE.md`
3. `03_TECHNICAL_ARCHITECTURE.md`
4. `05_SEO_AND_GOOGLE_RANKING_STRATEGY.md`
5. `08_V2_MASTER_PLAN.md`
6. `09_CURRENT_PROBLEMS_AND_FIXES.md`
7. `10_DECISIONS_LOG.md`
8. `14_OPEN_TASKS.md`

Then read `CONFLICTS_AND_UNKNOWN.md`. It is short and it will stop you acting
on things nobody has actually established.

Also read the pre-existing project docs, which predate this handoff and remain
authoritative in their own areas:
- `docs/CONTENT-RULES.md` — authoritative for all content editing
- `docs/D1-TAG-CACHE-BUG.md` — a silent-failure postmortem worth internalising
- `docs/DEPLOY-2026-08-22.md` — the last real deploy record
- `docs/PROJECT-STATE-2026-08-26.md` — the working state doc from the last session

## Recommended next actions

1. Commit the eight pending changes, then build, `predeploy-check.mjs` (must
   print 4/4), and deploy. Verification steps are in `12_CURRENT_DEPLOYMENT_STATE.md`.
2. Set `CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` as Worker secrets.
   Without them, publishing never clears the edge. This is the root cause of a
   real bug documented in `09_CURRENT_PROBLEMS_AND_FIXES.md`.
3. Do not start new work until the pending batch is live and verified.

## How the owner wants you to work

Evidence, then diagnosis, then an approved change, then implementation, build,
predeploy check, deploy, measure. No speculative SEO changes. Full detail in
`13_WORKFLOW_AND_WORKING_RULES.md`. Read it before touching anything.
