# Project state and working plan

**Written 26 August 2026.** Read this first if a session is lost. It records
what is actually true right now, what was WRONG in earlier notes, and the
agreed order of work. Files are the source of truth; this file points at them.

Companion documents: `seo-audit-cinetonight-com-2026-08-26.pdf` (full live-site
audit), `CONTENT-RULES.md` (authoritative for content), `DEPLOY-2026-08-22.md`
(last recorded deploy), `D1-TAG-CACHE-BUG.md` (silent-failure precedent).

---

## 1. Corrections to earlier beliefs

These were stated confidently and were wrong. Do not re-inherit them.

| Earlier claim | Reality, verified 26 Aug |
| --- | --- |
| "The Netflix post does not exist" | It is LIVE at `/blog/what-to-watch-on-netflix`, 2,200 words, published 25 Aug |
| "best-anime-for-beginners is an unpublished draft" | LIVE, published 24 Aug, links to real verified movie URLs |
| "No commit since Aug 22 touched SEO files" | `ef058fc` (23 Aug) touched sitemap, middleware, open-next config, movie and person routes |
| "The path guard may be 404ing real movie pages" | It is not. `MAX_TMDB_ID` is 20,000,000 against real ids in the low millions |

**Root cause of the first two:** `content/posts/*.md` are STALE EXPORTS. The
front matter says `status: draft` while the database says published. Always
check the live URL, never trust the local export's status field.

**Root cause of the third:** this repo commits AFTER deploying.
`DEPLOY-2026-08-22.md` was added in the 23 Aug commit. Commit dates lag deploy
dates, so never infer "what is live" from git history alone.

---

## 2. What is confirmed live

- `robots.txt` matches `app/robots.ts` exactly. Googlebot is NOT blocked.
- Phase 4A sitemap is deployed: zero `/person/` URLs, 463 URLs total.
- The 23 Aug blog rebuild shipped AND was published correctly (Cocktail 2 went
  from 223 words / 0 body H2s to ~950 words / 5 H2s + FAQ).
- Movie pages are healthy: correct self-referencing canonicals, correct
  branding, intent-led titles. Verified on Lanterns, Toy Story 5, Spider-Man.
- Test suite passes 280/280.

---

## 3. Open defects, triaged by real impact

### Tier 1 — matters

- **Stale cache is a MECHANISM problem.** `/trending` serves pre-rebrand
  "MOVIEX" HTML with a cross-domain canonical to
  `cinetonight-lj9xhtkg1-cine-tonight.vercel.app`. Those objects survived the
  entire Vercel-to-Cloudflare migration and have never regenerated. `/latest`
  also still carries a MOVIEX title. Rebuilding the pages fixes the symptom and
  leaves the cause. Understand WHY they never refreshed before touching
  sitemap scope.
- **Trust pages look abandoned.** `/privacy-policy` is ~85 words with no H1.
  `/contact-us` body text is literally "you can". `/contact` is a duplicate
  stub. `/about-us` H1 is generic boilerplate and names no humans. Cheap to
  fix, disproportionate damage to quality assessment.
- **Sitemap covers 180 movie URLs against ~24,000 indexed.** The top earners
  (Hallam Foe, Nando Between Two Worlds, Repeated Love, The Skin I Live In) are
  NOT in it. Biggest growth lever available, but the 150 cap is deliberate:
  advertising the full long tail previously invited crawl storms and R2 cost.
  This is a tradeoff needing a design decision, not a quick fix.
- **Blog index is stale.** Omits the two newest posts, still lists the retired
  redirected post, ordering not strictly reverse-chronological.

### Tier 2 — batch into whatever deploy happens anyway

- Generic boilerplate H1 leaking onto `/about-us`, `/contact`, `/latest`
- Missing H1 on `/genres`, `/web-series`, `/privacy-policy`, `/trending`
- Title suffix: hub and custom pages append the full tagline, reaching ~95 chars
- `/genres` links to non-canonical values that middleware then 308s away
- `cant-decide-what-to-watch-tonight` links in-body to a slug that now 308s
- `app/movie/[id]/loading.tsx` still exists; removed from blog/person/root in
  the same deploy because a Suspense boundary turns notFound() into HTTP 200
- `/movies?sort=rating` returns junk. `rankByWeightedRating` is used as a sort
  but its first line FILTERS to votes >= 50. Also `merged.sort(() => 0)` in
  `lib/tmdb.ts` is a no-op comparator.

### Tier 3 — GEO / authority

- Every article bylined "Editorial Desk". No named author, no bio, no
  credentials anywhere. No published editorial policy despite a strict internal
  Confirmed / Reported / inference convention.
- Brand has effectively zero external footprint. A brand search returns
  competitors (CineVibe, CineNightly, Cineo, The Movies Finder) but not us.

---

## 4. The traffic collapse: STILL UNEXPLAINED

Nothing found in code or in the live audit explains clicks and impressions both
falling ~99% in 24 hours while pages stayed indexed. Metadata, schema and
link-graph regressions decay over weeks; they do not produce an overnight cliff.

Leading hypothesis, unverified: a serving or crawl-access problem at the
Cloudflare edge. `app/robots.ts:32` refers to "a matching edge rule" that is NOT
in the repository. That layer is the one blind spot.

Do NOT spoof a Googlebot user agent to test this. Cloudflare verifies Googlebot
by reverse DNS, so a spoofed UA from any datacentre IP is blocked on a healthy
site and would produce a convincing false positive. Use GSC Live Test, which
fetches as genuinely verified Googlebot.

---

## 5. Agreed order of work

- [ ] **Phase 1 — finish the diagnosis. BLOCKED ON USER.**
      GSC URL Inspection Live Test on a strong movie page.
      Cloudflare Security Events filtered to Googlebot around 16 and 21 Aug,
      plus WAF custom rules, Bot Fight Mode, rate limiting.
      Needed from user: the Hallam Foe URL (not in sitemap, cannot be resolved
      locally because `/search` is correctly robots-disallowed).
- [ ] **Phase 2 — one batched fix.** Trust pages, H1s, title suffix, blog
      index. Single deploy, not several. Must record a `DEPLOY-` doc.
- [ ] **Phase 3 — cache mechanism investigation.** Why did those routes never
      regenerate? Do this BEFORE expanding crawl surface.
- [ ] **Phase 4 — movie page and sitemap strategy.** The growth work. Deserves
      its own design pass.

**Open decision:** will anyone maintain the OTT release-date posts weekly?
`CONTENT-RULES.md` forbids promising freshness that will not be delivered. If
no, strip the update promises rather than build the hub.

---

## 6. Standing constraints

Process is: evidence, diagnosis, approved change, implementation, build,
predeploy check, deploy, measure. No speculative SEO changes.

Deploy sequence is non-negotiable: `npx opennextjs-cloudflare build`, then
`node scripts/predeploy-check.mjs` must print 4/4, then deploy.
`enableCacheInterception` stays false.

Movie pages are the main SEO asset, not the blog. Blog supports movie pages.

The device bridge cannot delete files, so `git status` leaves a stranded
`.git/index.lock`. Prefer `git log`, `git show`, `git grep`, `git rev-parse`.

---

## 7. PHASE 3 RESULT — root cause found, and a correction to the audit

**Resolved 26 August.** The audit's Tier 1 findings were largely WRONG. Most of
what it recorded as broken pages were stale cache artifacts, not real defects.

### The proof

Adding any query string changes the cache key and bypasses the stored entry.
Every "broken" page rendered correctly when fetched that way:

| URL | Bare URL served | With `?cb=` served |
| --- | --- | --- |
| `/trending` | "…— MOVIEX", canonical to `…vercel.app` | "…— CineTonight", canonical correct |
| `/latest` | "…— MOVIEX", boilerplate H1 | "…— CineTonight", H1 "Latest Releases" |
| `/blog` | missing 2 newest posts, listed a retired one | both new posts present, correct titles |
| `/privacy-policy` | no H1, ~85 words | H1 "Privacy Policy", ~520 words of real policy |
| `/about-us` | boilerplate H1 | H1 "About CineTonight" |
| `/genres` | no H1, non-canonical genre links | H1 "Genres", canonical links only |
| `/web-series` | no H1, long brand suffix | H1 "Web Series", short suffix |

**The application code is correct. No code fix is needed for any of these.**

### What it is NOT

Response headers on `/trending` show `server: cloudflare`, `x-opennext: 1`,
`cfWorker;dur=999`, `cfOrigin;dur=0`, and **no `cf-cache-status` and no `age`**.
So it is not Vercel still serving traffic, not a Cloudflare CDN replay, and not
stale HTML in the build artifact (`.open-next/assets` holds no prerendered
listing HTML and is dated 23 Aug).

It is a stale per-URL entry in the Worker's own cache layer, almost certainly
the regional cache configured in `open-next.config.ts` as
`withRegionalCache(r2IncrementalCache, { mode: "long-lived",
shouldLazilyUpdateOnCacheHit: false })`. That setting, added 16 Aug for R2 cost
reasons, is exactly what stops an entry ever refreshing itself.

### Why it never cleared

`CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` are unset, so
`lib/revalidateCms.ts` reports `cdn: "not-configured"` and skips the
single-file purge on every publish. `D1-TAG-CACHE-BUG.md` assessed this as
"currently costs nothing" because Cloudflare was not edge-caching Worker
responses at the time. **That assessment is now demonstrably out of date.**

### Dating the stale entries

The `vercel.app` canonical requires `VERCEL_URL`, which only Vercel's runtime
sets, and `MOVIEX` predates the 14 Aug rebrand. Cloudflare migration was 15 Aug.
So the frozen entries were rendered on or before ~14 August. My audit said
"months ago"; that was wrong, it is about eleven days.

### What survives the correction as genuinely real

- `/contact-us` body text is literally "you can". Confirmed with a fresh cache
  key. This one is real and is database content.
- `/contact` and `/contact-us` are duplicates, both in the sitemap.
- `/about-us` is thin at ~220 words with no named people or editorial policy.
- No named author anywhere; every post is bylined "Editorial Desk".
- Sitemap lists 180 movie URLs against ~24,000 indexed; top earners absent.
- `app/movie/[id]/loading.tsx` still present after being removed elsewhere.
- `rankByWeightedRating` is used as a sort but filters to votes >= 50.
- `merged.sort(() => 0)` in `lib/tmdb.ts` is a no-op comparator.
- Movie pages are healthy and serve fresh. The money pages are NOT affected.

### Revised fix path

This is a configuration fix, not a deploy. Purge the affected URLs at
Cloudflare, then set the two purge secrets so publishes clear the edge properly
from now on. Phase 2's "batched code fix" is now mostly unnecessary.

- [x] Phase 3 — cache mechanism understood
- [ ] Purge stale URLs and set `CACHE_PURGE_ZONE_ID` / `CACHE_PURGE_API_TOKEN`
- [ ] Regenerate the audit report; the published version overstates Tier 1

---

## 8. Cloudflare edge rules — reviewed 26 August

**Site went live 14 August 2026.** This dates the launch-day cache entries in
section 7 and means the site was ~10 days old when traffic collapsed.

### Googlebot is NOT blocked — edge hypothesis cleared

- Rule 1 targets named scrapers; no Google token.
- Rule 2 challenges cloud ASNs but is guarded by `Known Bots != true`.
  Googlebot is a verified bot on AS15169, which is not in the list.
- Rule 3 matches UA substrings. `google-extended` is a robots.txt token, NOT a
  string Googlebot sends. Googlebot's UA does not contain it.
- Rule 4 targets ClaudeBot only.
- Bot policies: Search **Allow**, Agent **Allow**, Training **Allow**.
- Every IP in the event log is AWS EC2. Googlebot crawls from 66.249.x.
  Zero Googlebot blocks observed.

Conclusion: the edge is not causing the Google traffic loss. Combined with the
14 Aug launch date, a new-site visibility correction is now the leading
explanation for the collapse.

### Fixed during this session

**Rule 3** previously included `/movie/tmdb-` in its path list, blocking every
major AI crawler from the entire long-tail movie page space (69,410 blocks)
while robots.txt explicitly allowed them there. `app/robots.ts:32` claimed "a
matching edge rule enforces this"; it did not match. The path was removed by
the user. Rule 3 now covers `/person/` and `/_next/image` only, which matches
robots.txt exactly.

### Still open

- [ ] **Rule 4** blocks ClaudeBot on ALL paths except `/robots.txt`, which
      still contradicts robots.txt. Recommendation: delete it. Rule 3 already
      matches `contains "claude"` on the paths that need protecting.
- [ ] **Backlog, agreed to tackle later:** Rule 3's UA list is broader than
      robots.txt's AI group. `diffbot`, `youbot`, `omgili`, `timpibot`,
      `cohere`, `imagesiftbot`, `friendlycrawler` and `applebot-extended` fall
      under robots.txt's `*` group, which does NOT disallow `/person/`. They
      are blocked at the edge while robots.txt permits them. Defensible as cost
      containment, but the two should be aligned deliberately rather than by
      accident. `bytespider` in Rule 3 is redundant; Rule 1 already blocks it.
- [ ] GSC URL Inspection Live Test on a top movie page. Last diagnosis item.
      Note: Rule 2 challenges Google Cloud AS396982, and some Google testing
      tools originate there. If the Live Test errors, suspect that rule before
      concluding there is a real crawl problem.

---

## 9. PHASE 1 CLOSED — there is no technical cause

**GSC URL Inspection, 26 August, on `/movie/tmdb-m-2239-hallam-foe`.**

Indexed inspection:
- Page is **indexed**
- Last crawl **25 Aug 2026, 10:37 PM**, as Googlebot smartphone
- Crawl allowed **Yes** · Page fetch **Successful** · Indexing allowed **Yes**
- User-declared canonical = `/movie/tmdb-m-2239-hallam-foe`
- **Google-selected canonical = "Inspected URL"** — Google agrees with ours
- Discovery: **Referring page**, not sitemap (confirms the sitemap gap)
- Sitemaps field showed "Temporary processing error" — check the Sitemaps report

Live test: HTTP **200 OK**, crawl allowed, fetch successful, indexing allowed,
no JS console errors. 2 of 47 page resources failed to load (minor, worth a
look but not blocking).

Live page source confirmed excellent: correct self-referencing canonical, full
Movie JSON-LD with a real aggregateRating (6.7 from 189 votes), BreadcrumbList,
WebSite and Organization schema with email and five sameAs profiles, `lang="en"`,
no noindex. **Corrects the audit's "Organization schema needs attention" —
it exists and is well formed.**

### Conclusion

Every technical hypothesis is now eliminated: robots.txt is correct, Googlebot
is not blocked at the edge, movie pages serve perfect fresh HTML, Google crawls
them successfully and agrees with our canonical, and the pages are indexed.

The site went live **14 August** and collapsed around **23 to 25 August**, at
roughly ten days old. A new domain receiving an initial visibility boost that is
then withdrawn when the algorithm re-evaluates on real quality and engagement
signals fits every observation: all queries at once, overnight, pages still
indexed, identical shape in Analytics.

**Treat the collapse as a new-site visibility correction, not a fault.** Stop
hunting technical causes. Recovery comes from authority, content and time.

### The one big lever this revealed

Indexing demonstrably WORKS: Google found Hallam Foe through a referring page,
crawled it, and indexed it. Discovery is the bottleneck, not indexability. The
sitemap carries 180 movie URLs against ~24,000 indexed pages. Expanding that
coverage is now the highest-leverage growth action available, subject to the
crawl-cost tradeoff in section 3.

- [x] Phase 1 — diagnosis complete, no technical cause found
