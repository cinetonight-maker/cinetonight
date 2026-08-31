# 15 — Project timeline

Dates from commits, project docs, and the 25-26 August session. Where a date is
inferred rather than recorded, it says so.

## Pre-launch — early August 2026

Commits from around 5-13 August: initial build, Next.js 16 / React 19 /
TypeScript 7 upgrade (`1621a48`), Google Search Console verification
(`2703471`), Dependabot (`0350b83`), mobile UI and SEO/security audit
(`09278f5`), homepage reworks, channel pages, legal pages (`3cf0ba5`),
region-aware availability and free classics (`6b86986`, `74461a5`),
`docs/seo-audit-moviex-2026-08-13` produced under the old MOVIEX brand.

## 14 August 2026 — LAUNCH

- **Site goes live** (owner-stated)
- **Rebrand MOVIEX → CineTonight** (`39db5f1`)
- Blog system, analytics, logo, polish (`893838f`)
- Terms of Service dated 2026-08-14; Contact page dated the same
- **`NEXT_PUBLIC_SITE_URL` was evidently unset at this point** — the launch-day
  renders that survive on `/trending` carry a `vercel.app` canonical

## 15 August 2026 — Cloudflare migration

- Host-portable middleware, dual geo header, Cloudflare config (`5cde30e`)
- Cloudflare migration: robots update, logo manifest (`82babd7`)
- `docs/CLOUDFLARE-FALLBACK.md` records the migration was tested on 14 Aug:
  ~6.4 MB gzipped bundle, exceeding the Workers Free 3 MiB limit

## 16-17 August — first cost work

- `56cfa8a` cut R2 write ops: longer ISR windows, cache interception **on**,
  no lazy refresh
- `6d3a394` bot mitigations plus tested Cloudflare fallback
- `0ea7699` homepage rails pruned
- **Search Console later reported robots.txt fetch failures around 16 August.**
  Cause never established; Cloudflare's 24h log retention means it no longer can be.

## 18 August — R2 round 2

- `66053cb` DO revalidation dedupe, 5-page browse cap, search off persistent cache
- `362cf03` homepage decision engine, 1-call homepage, lazy Supabase

## 19-20 August — analytics and pre-deploy

- `docs/ANALYTICS.md` (19 Aug) — GA4 foundation, consent mode, event dictionary
- **20 Aug: `enableCacheInterception` disabled** — root cause of the RSC
  prefetch loop (~40 req/s per tab, 25k+ requests in one session)
- `docs/PRE-DEPLOY-AUDIT-2026-08-20.md` — status GREEN, **not deployed**

## 21 August — CMS and blog SEO

- `docs/BLOG-PUBLISHING-WORKFLOW.md` — the 15-check publish checklist
- Admin CMS stages documented (`CMS-STAGE2` through `CMS-STAGE6`)
- `docs/SEO-ARCHITECTURE-AUDIT.md` — the finding that person pages were 46% of
  the indexed sample; the noindex decision
- `temp/Blog_CMS_Guidelines_and_Post.docx` (21 Aug) — the original client
  guidelines. **Now obsolete**: it instructs "use one H1 only" and its sample
  body opens with an H1, which is the exact duplicate-heading bug.
- **Search Console reported robots.txt fetch failures around 21 August.**

## 22 August — the deploy, and the silent bug

- `docs/PRODUCTION-READINESS-AUDIT.md`, `SEO-PHASE-4B-2/3` measurements
- **Production deploy `8682b8f8`.** Predeploy 4/4, tests 265/265, 84 R2 entries,
  Worker startup 30 ms. Post-deploy verification 6/6.
- **D1 tag cache bug found and fixed the same day.** `withFilter` renamed the
  tag cache so `populateCache` never created the `revalidations` table.
  Publishing had been silently doing nothing.

## 23 August — content rebuild

- `ef058fc` (10:07) — admin CMS, SEO phases 4A-4B, deploy tooling, 265 tests.
  **A retroactive commit of work deployed on the 22nd.**
- `docs/BLOG-AUDIT.md` — all 11 posts audited. Two good, three competent, six
  thin or structurally broken. Duplicate title resolved with the first real use
  of the Redirect Manager.
- `docs/CONTENT-RULES.md` written (17:25) — **never committed**
- `3827a4c` (22:19) — rebuild five posts, FAQ schema, corrected checklist rules.
  **Never deployed.**
- GA4: **178 new users, 1.05K events**

## 24 August — the decline begins

- `best-anime-for-beginners` published (1,400 words)
- GA4: **101 new users, 699 events**

## 25 August — the collapse

- `what-to-watch-on-netflix` published (2,200 words, 50 picks, evergreen slug)
- GA4: **4 new users, 61 events**
- GSC: roughly **3 clicks, ~200 impressions** in a 24-hour period, down from
  ~170 clicks/day
- Googlebot crawled `/movie/tmdb-m-2239-hallam-foe` at 22:37 — successfully
- **Session begins:** previous Cowork conversation lost; project reconstruction
  from files

## 26 August — investigation, audit and build

- Takeover report; several earlier beliefs corrected
- Full SEO/GEO/AEO audit (scores 5/4/6 — the SEO score later found understated)
- Stale-cache root cause proven via cache-busting query strings
- Cloudflare rules reviewed; Rule 3 corrected, Rule 4 deleted
- GSC URL Inspection: everything clean; **conclusion — new-site correction, no
  technical fault**
- Eight code changes built and verified; **held for a batch deploy**
- CMS pages rewritten and published: about-us, contact, privacy-policy,
  terms-of-service; `/contact-us` retired with a redirect
- `supabase/blog_author.sql` run by the owner

## 27-30 August

**No recorded activity.** No commits, no deploys, no documented events.

## 31 August 2026 — today

- Working tree unchanged since 26 August; still uncommitted, still undeployed
- Handoff package created
- Owner signals intent to deploy and then "go toward the v2 of our product" —
  the first and only mention of V2

## UNKNOWN

Events the handoff brief referenced that have no basis in the files or session:
an "August 15-17 issue" as a discrete event, an "August 27 deployment", and an
"August 29 activity spike".
