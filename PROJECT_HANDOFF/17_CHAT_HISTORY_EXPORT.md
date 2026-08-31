# 17 — Session knowledge export

Chronological extraction of the useful knowledge from the working session of
**25-26 August 2026**, plus the brief exchange on **31 August 2026**. Casual
back-and-forth is omitted. This is the closest persistent record of that
conversation.

**Context:** the session began because a previous Cowork conversation was
accidentally deleted. Everything below was reconstructed from the project
files, live site inspection, and dashboards the owner read out.

---

## Phase 1 — Project reconstruction

The owner supplied extensive context from the lost conversation. Key facts he
stated, which shaped everything after:

- Movie pages are the main SEO asset — ~57k impressions / ~350 clicks, of which
  306 clicks from movie pages, 9 from the homepage
- Another period: movie pages at 50k+ impressions, 479 clicks
- Ranking examples: Hallam Foe ~6.4, Repeated Love ~8, The Skin I Live In ~7.5,
  Nando Between Two Worlds ~4.4
- ~24,000 indexed pages, mostly movie pages
- Traffic dropped from ~170 clicks/day to ~3 clicks / ~200 impressions
- GA4: 23 Aug 178 users, 24 Aug 101, 25 Aug 4
- GSC Crawl Stats had shown "Host had problems" with robots.txt fetch failures
  around 16 and 21 August; direct curl returned 30/30 HTTP 200
- Person pages deliberately noindexed and removed from the sitemap
- "Do NOT suddenly conclude that the blog is the main SEO asset"

**Four beliefs from the lost conversation turned out wrong**, corrected during
the takeover:

1. "The Netflix post does not exist" — it was **live**, 2,200 words, published
   25 Aug. Cause: `content/posts/*.md` are **stale exports** whose `status:`
   field says `draft` while the database says published.
2. Same for `best-anime-for-beginners` — live, published 24 Aug
3. "No commit since Aug 22 touched SEO files" — `ef058fc` (23 Aug) touched
   sitemap, middleware, open-next config, movie and person routes. It was a
   **retroactive commit of work deployed on the 22nd**.
4. "The path guard may be 404ing real movie pages" — it is not.
   `MAX_TMDB_ID` is 20,000,000 against real ids in the low millions.

## Phase 2 — The traffic investigation

Hypotheses were raised and eliminated in order. Recorded because a new account
should not repeat them:

- **Path guard blocking real pages** — ruled out by reading `lib/pathGuard.ts`
- **Cloudflare blocking Googlebot** — ruled out. Every blocked IP in the event
  log was AWS EC2; Googlebot crawls 66.249.x; bot policies all Allow; Rule 3's
  `google-extended` is a robots.txt token, not a UA string Googlebot sends.
- **Vercel still serving part of the domain** — ruled out by response headers:
  `server: cloudflare`, `x-opennext: 1`, `cfWorker;dur=999`, `cfOrigin;dur=0`
- **Cloudflare edge replaying old objects** — ruled out: no `cf-cache-status`,
  no `age`
- **Stale HTML in the build artifact** — ruled out: `.open-next/assets` holds no
  prerendered listing HTML and is dated 23 Aug

**GSC URL Inspection on `/movie/tmdb-m-2239-hallam-foe`** settled it:
indexed; last crawl 25 Aug 22:37 as Googlebot smartphone; crawl allowed; page
fetch successful; indexing allowed; **Google-selected canonical = Inspected
URL**; discovery via **Referring page**, not sitemap. Live test HTTP 200,
2 of 47 resources failed, no JS console errors.

**Conclusion:** the site launched 14 August and was ~10 days old at the
collapse. A new-domain visibility correction fits every observation. **No
technical cause exists.**

A methodological point worth keeping: **do not spoof a Googlebot UA** to test
edge blocking. Cloudflare verifies Googlebot by reverse DNS, so a spoofed UA
from a datacentre IP is blocked on a healthy site.

## Phase 3 — The stale cache discovery

The audit initially reported many broken pages. **Proven wrong** by adding a
query string, which changes the cache key. Every "broken" page rendered
correctly with `?cb=`. The application code was correct throughout.

Root cause: stale per-URL entries dating to launch day, never refreshed because
`CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` are unset, so
`lib/revalidateCms.ts` skips the purge on every publish.

`docs/D1-TAG-CACHE-BUG.md` had assessed those missing secrets as "currently
costs nothing". **That assessment is out of date.**

Genuinely real and surviving the correction: `/contact-us` body was literally
`"you can"`; duplicate contact pages; a thin About page; the sitemap covering
180 of ~24,000 movie pages; `app/movie/[id]/loading.tsx`; and the dead
`merged.sort(() => 0)`.

## Phase 4 — The Cloudflare rules finding

Rule 3 blocked every major AI crawler from `/movie/tmdb-*` — the entire long
tail — with **69,410 events**, while robots.txt explicitly allowed them.
`app/robots.ts:32` claimed "a matching edge rule enforces this". It did not
match. The owner removed `/movie/tmdb-` and deleted Rule 4.

## Phase 5 — The GSC resource finding

The indexed-page inspection listed 39 failed resources versus 2 on the live
test. Two mattered:

- `Googlebot blocked by robots.txt → /api/watch` — **Where to Watch is
  invisible to Google on ~24,000 pages**
- `/_vercel/insights/script.js` and `/_vercel/speed-insights/script.js` —
  removed from the code during the Cloudflare migration, so Google's last full
  **render** of those pages predates that removal

## Phase 6 — Decisions and build

Region for server-rendered availability: **US**, chosen by the owner.

**Amazon Prime.** The owner proposed pinning Prime to the top of every title
with a "Start 30 days free trial" button regardless of real availability.
Refused, with reasons: no SEO upside, misleading `offers` markup is a
manual-action category, it contradicts the site's own promise, and it breaks
affiliate conversion. **The codebase had already rejected the same idea** —
`lib/watchRows.ts` carries a `streaming` guard added because without it "nearly
every movie showed a Start Free Trial Prime strip for a title Prime doesn't even
include". Owner accepted Prime-first-where-genuine instead.

**Sitemap expansion.** Proposed, then dropped on the owner's reasoning that
TMDB has millions of films and Google already found 24k on its own.

**Authors.** Shahzaib Ali (founder) and Syed Ahmad (writer and editor). Both
options taken: a default author constant **and** a per-post database column.

**Origin story**, in the owner's words, now on the About page: he had watched a
lot of films, kept struggling to decide what to watch, could not find a
solution anywhere, and reasoned other film lovers had the same problem.

## Mistakes made and corrected during the session

Recorded so they are not repeated:

1. The audit reported stale cache as broken pages
2. "Generated months ago" — it was eleven days
3. A reframe that the base titles looked current — they predated the rebrand
4. A server-only value import into a client component, which would have failed
   the build (`lib/watchRows.ts` starts with `import "server-only"`)
5. An import inserted into the middle of a multi-line import block in
   `SettingsManager.tsx`, breaking `tsc`
6. A test fixture too short to test what it claimed
7. `blog_revisions.author` collision — caught before the SQL was run
8. Overstated that Google's watch-options rich result reads `offers` markup;
   it is restricted to approved media partners

## Important commands

```
node scripts/export-posts.mjs
node scripts/import-post.mjs <slug>
node scripts/import-page.mjs <slug> [--dry]
node scripts/fix-page-h1.mjs --all --dry
npx tsc --noEmit
npx opennextjs-cloudflare build
node scripts/predeploy-check.mjs
npx opennextjs-cloudflare deploy
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --file=./d1/tag-cache-init.sql
```

## Important URLs

Production `https://cinetonight.com` · sitemap `/sitemap.xml` ·
robots `/robots.txt` · verified movie page `/movie/tmdb-m-2239-hallam-foe` ·
dead preview host in stale HTML `cinetonight-lj9xhtkg1-cine-tonight.vercel.app` ·
contact `officialcinetonight@gmail.com` · GA4 `G-641P0WNNTW`

Social: facebook.com/cinetonight1 · x.com/cinetonight1 ·
instagram.com/cinetonight · youtube.com/@cinetonight · tiktok.com/@cine.tonight

Competitors found in a brand search (CineTonight did **not** appear):
CineVibe, CineNightly, Cineo, The Movies Finder, plus JustWatch and Reelgood.

## 31 August 2026

Owner confirmed nothing had been deployed, asked whether anything important
remained before deploying, then requested this handoff package ahead of moving
to "the v2 of our product" — the first mention of V2 in the project.
