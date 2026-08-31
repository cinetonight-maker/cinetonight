# 09 — Problems and fixes log

---

## P1 — Traffic collapse

**Date:** ~23-25 August 2026. **Status: DIAGNOSED, no technical cause. OPEN as
an observation.**

**Symptoms.** ~170 clicks/day for several days, then one 24-hour period at ~3
clicks and ~200 impressions. Previously successful movie pages showed zero for
that window. Pages remained indexed. GA4 matched: 23 Aug 178 new users / 1.05K
events; 24 Aug 101 / 699; 25 Aug 4 / 61. Realtime tracking verified working, so
"analytics is broken" was ruled out early.

**Investigation, in order, all negative:**
1. robots.txt — live, HTTP 200, matches source, Googlebot unrestricted
2. Path guard — `MAX_TMDB_ID` is 20,000,000 vs real ids in the low millions;
   cannot be 404ing real pages
3. Vercel still serving? No — headers show `server: cloudflare`, `x-opennext: 1`
4. Cloudflare edge replay? No — no `cf-cache-status`, no `age`
5. Cloudflare blocking Googlebot? No — every blocked IP was AWS; Googlebot uses
   66.249.x; bot policies all Allow
6. **GSC URL Inspection on `/movie/tmdb-m-2239-hallam-foe`:** indexed, last
   crawl 25 Aug 22:37, crawl allowed, fetch successful, indexing allowed,
   Google-selected canonical = Inspected URL. Live test HTTP 200, no JS errors.

**Conclusion.** The site launched **14 August**. It was ~10 days old when
traffic collapsed. A new domain receiving an initial visibility boost that is
withdrawn on re-evaluation fits every observation: all queries at once,
overnight, pages still indexed, identical shape in Analytics.

**Treat as a new-site visibility correction, not a fault. Stop hunting
technical causes.** Recovery comes from authority, content and time.

**Lesson.** Do not spoof a Googlebot user agent to test edge blocking.
Cloudflare verifies Googlebot by reverse DNS, so a spoofed UA from a datacentre
IP is blocked on a healthy site — a convincing false positive. Use GSC Live Test.

---

## P2 — Launch-day cache entries still serving

**Date found:** 26 August 2026. **Status: DIAGNOSED, NOT FIXED.**

**Symptoms.** `/trending` served pre-rebrand **"MOVIEX"** branding and a
cross-domain canonical to `cinetonight-lj9xhtkg1-cine-tonight.vercel.app`.
`/latest` showed a MOVIEX title. Several hubs and custom pages showed missing
H1s, wrong H1s, an 85-word privacy policy and a stale blog index.

**Proof of cause.** Adding any query string changes the cache key. Every page
rendered correctly with `?cb=`:

| URL | Bare | With `?cb=` |
| --- | --- | --- |
| /trending | MOVIEX, vercel.app canonical | CineTonight, correct canonical |
| /latest | MOVIEX, boilerplate H1 | CineTonight, H1 "Latest Releases" |
| /blog | missing 2 newest posts | both present |
| /privacy-policy | no H1, ~85 words | H1 present, ~520 words |
| /about-us | boilerplate H1 | H1 "About CineTonight" |
| /genres | no H1, bad genre links | H1 present, canonical links |
| /web-series | no H1, long suffix | H1 present, short suffix |

**The application code is correct. No code fix is needed for any of these.**

**Ruled out:** not Vercel (`x-opennext: 1`, `cfWorker;dur=999`, `cfOrigin;dur=0`),
not a CDN replay (no `cf-cache-status`, no `age`), not the build artifact
(`.open-next/assets` holds no prerendered listing HTML).

**Cause.** A stale per-URL entry in the Worker's own cache layer, almost
certainly the regional cache configured `mode: "long-lived"` with
`shouldLazilyUpdateOnCacheHit: false` — the setting added 16 Aug for cost
reasons is exactly what stops an entry refreshing itself.

**Why it never cleared.** `CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` are
unset, so `lib/revalidateCms.ts` reports `cdn: "not-configured"` and skips the
purge on every publish.

**Dating.** `VERCEL_URL` is only set by Vercel's runtime. MOVIEX predates the
14 Aug rebrand. Cloudflare migration was 15 Aug. These are **launch-day
renders** that never refreshed.

**Fix required:** purge those URLs at Cloudflare **and** set the two secrets.
A new deploy may clear them via new cache keys — verify either way.

**Files affected:** none. Configuration only.

---

## P3 — Where to Watch invisible to Google

**Date found:** 26 August 2026. **Status: FIXED IN CODE, NOT DEPLOYED.**

**Symptom.** GSC resource list showed `Googlebot blocked by robots.txt` for
`/api/watch`. The panel is a client island; crawlers cannot call it, so ~24,000
movie pages index the literal text *"Checking availability in your country…"*
under titles promising "Where to Watch".

**Fix.** Server-render one fixed region into the cached HTML as the island's
initial state; the browser still swaps in the visitor's real country on load.
Region chosen: **US** (denser TMDB coverage; Googlebot crawls mostly from the
US; `buildWatch` already falls back US → IN → GB → any). Real providers also
added to Movie JSON-LD as `offers`.

**Cost trap avoided.** The providers fetch carries `TTL.steady` (24h). Next
takes the **shortest** TTL in a segment, so it would have dropped movie pages
from 72h to 24h — 3x the regenerations and R2 writes. A `longTtl` flag pins the
server-rendered call to `TTL.stable` (72h). Visitors still get 24h-fresh data
via `/api/watch`.

**Files:** `app/movie/[id]/page.tsx`, `components/WhereToWatch.tsx`,
`components/MovieDetail.tsx`, `lib/watchRows.ts`, `lib/tmdb.ts`, `app/globals.css`.

---

## P4 — Junk films on the default /movies listing

**Date found:** 26 August. **Status: FIXED IN CODE, NOT DEPLOYED.**

**Symptom.** The listing showed "Good hobo = DEAD hobo", "TNA Lockdown 2026",
"Les Sa-sseuses de vampires".

**First diagnosis was wrong** and is recorded as a lesson. It was labelled a
"Top Rated bug". In fact `/movies` never reads `sort` from the URL — it only
reads `genre` and hardcodes `defaultSort="year"`. The junk was the **default
newest-first listing**.

**Cause.** `MIN_VOTES.year = 1`. "Newest first, at least one vote" is every
no-name release on earth. `titleTier(m) !== "C"` did not catch them because
Tier C needs **both** no poster and no overview.

**Fix.** `MIN_VOTES.year: 1 → 25`, applied at the TMDB query as
`vote_count.gte` so pagination stays even. Filtering after the fetch would give
ragged pages.

**Files:** `lib/tmdb.ts`.

---

## P5 — Soft 404s on movie pages

**Date:** long-standing; fixed 26 August. **Status: FIXED, NOT DEPLOYED.**

`app/movie/[id]/loading.tsx` created a Suspense boundary, so the server answered
200 before knowing the film existed. Invented ids returned "found" to Google.
Blog and person pages had this removed earlier; movie was deliberately left
pending an analytics review.

`docs/SEO-PHASE-4B-1.md` proposed a route-group move. That was written as "what
I would do" and never tested. **The proven fix — deletion — was used**, matching
blog and person. Cost: movie pages lose their loading skeleton.

---

## P6 — Legal and custom pages

**Date:** 26 August. **Status: FIXED AND LIVE.**

`/contact-us` body was literally `"you can"`. `/contact` duplicated it.
`/privacy-policy` and `/terms-of-service` both rendered their title **twice**
(the old seed script began each body with `# Title`). Privacy and Terms both
described the site as a "personal, non-commercial project" while affiliate
links were live — a false statement in the site's own terms.

Fixed via new `content/pages/*.md` and `scripts/import-page.mjs`. `/contact-us`
retired with a redirect. All four published.

---

## P7 — Historical incidents (resolved before this session)

- **R2 blow-up:** 2.79M objects / 211 GB / ~1M writes a day / "$70/month"
- **RSC prefetch loop:** ~40 req/s per tab, 25k+ requests in one session;
  `enableCacheInterception` disabled 20 Aug
- **`_next/image` replay:** 85k hits in one day
- **D1 table never created:** `withFilter` renamed the tag cache, so
  `populateCache` skipped it; publishing silently did nothing. Fixed 22 Aug.
- **Broken posters:** Vercel optimizer cap; fixed with `unoptimized: true`

## Lessons worth keeping

1. A finding read off a rendered surface is not a finding read off the source
2. "The binding is attached" is not proof a subsystem works
3. A feature that reports success while doing nothing is the worst bug shape
4. Commit dates lag deploy dates in this repo — never infer what is live from git
5. `content/posts/*.md` are stale exports; check the live URL
6. `npm test` only covers pure `lib/` functions. A broken import in a component
   is invisible to it. **Only `tsc` catches that class of error.**
