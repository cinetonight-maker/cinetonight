# PROJECT_HANDOFF

Complete knowledge transfer for **CineTonight** (https://cinetonight.com),
created **31 August 2026** so a new Claude account can pick the project up
without the owner re-explaining it.

## Start here

**`16_CLAUDE_NEW_ACCOUNT_START_HERE.md`** — read this first, then:

1. `01_PROJECT_MASTER_CONTEXT.md` — what the project is and why
2. `02_CURRENT_SITE_STATE.md` — live vs pending, working vs broken
3. `03_TECHNICAL_ARCHITECTURE.md` — stack, cache, request flow, decisions
4. `05_SEO_AND_GOOGLE_RANKING_STRATEGY.md` — **the most important strategy doc**
5. `08_V2_MASTER_PLAN.md` — read it to learn there is no V2 plan
6. `09_CURRENT_PROBLEMS_AND_FIXES.md` — every issue, with causes and status
7. `10_DECISIONS_LOG.md` — **so you don't undo settled decisions**
8. `14_OPEN_TASKS.md` — what to do next

Then **`CONFLICTS_AND_UNKNOWN.md`**. It is short and it will stop you acting on
things nobody has established.

## Full contents

| File | Covers |
| --- | --- |
| `01_PROJECT_MASTER_CONTEXT.md` | Purpose, audience, goals, terminology, the team |
| `02_CURRENT_SITE_STATE.md` | Production status, architecture, routes, what is broken |
| `03_TECHNICAL_ARCHITECTURE.md` | Stack, Cloudflare, cache, TTLs, env vars, deploy flow |
| `04_CLOUDFLARE_AND_COST_HISTORY.md` | The R2 incident, cost figures, what is unmeasured |
| `05_SEO_AND_GOOGLE_RANKING_STRATEGY.md` | Traffic data, indexing, linking, GEO, priorities |
| `06_CONTENT_AND_EDITORIAL_STRATEGY.md` | Content rules, workflow, existing posts |
| `07_INTERNAL_LINKING_MAP.md` | Verified URLs, hub/spoke, known gaps |
| `08_V2_MASTER_PLAN.md` | No V2 plan exists — and what already ships in V1 |
| `09_CURRENT_PROBLEMS_AND_FIXES.md` | Issue log with causes, fixes and status |
| `10_DECISIONS_LOG.md` | Decisions, reasons, alternatives rejected |
| `11_CURRENT_SECURITY_CONFIGURATION.md` | Cloudflare rules, bot policy, Googlebot |
| `12_CURRENT_DEPLOYMENT_STATE.md` | Live version, pending batch, commands, rollback |
| `13_WORKFLOW_AND_WORKING_RULES.md` | How the owner expects Claude to work |
| `14_OPEN_TASKS.md` | Prioritised task list |
| `15_PROJECT_TIMELINE.md` | Chronology from launch to today |
| `16_CLAUDE_NEW_ACCOUNT_START_HERE.md` | Onboarding |
| `17_CHAT_HISTORY_EXPORT.md` | Extracted session knowledge |
| `CONFLICTS_AND_UNKNOWN.md` | Conflicts, unknowns, open questions |

## Pre-existing docs that remain authoritative

This pack does not replace them:

- `docs/CONTENT-RULES.md` — **authoritative for all content editing**
- `docs/D1-TAG-CACHE-BUG.md` — the silent-failure postmortem
- `docs/BLOG-AUDIT.md` — per-post audit, 23 Aug
- `docs/DEPLOY-2026-08-22.md` — the last real deploy record
- `docs/PROJECT-STATE-2026-08-26.md` — working state from the last session
- `docs/SEO-ARCHITECTURE-AUDIT.md` — the person-page reasoning

## Three things that will trip you up

1. **This repo commits after deploying.** Never infer what is live from git.
2. **`content/posts/*.md` are stale exports.** Their `status:` field lies.
   Check the live URL.
3. **A page that looks broken may be a stale cache entry.** Add `?cb=1` to
   change the cache key before declaring anything broken.

## Sources

The 25-26 August 2026 working session, the project files as they stand on
31 August 2026, and dashboards the owner read out. Nothing was invented.
Unestablished items are marked UNKNOWN.
