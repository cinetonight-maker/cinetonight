# CineTonight — production readiness audit

**Date:** 22 August 2026 · **AUDIT ONLY — nothing changed.**
State at audit: `tsc` clean · `npm test` **263 / 263** · both builds OK ·
predeploy **4/4**. Findings below were checked against the code and, where
noted, measured in the real Cloudflare Worker.

---

## 1. Executive summary

The architecture is genuinely good. The things that usually go wrong on a
project like this — draft content leaking, XSS through Markdown, unbounded
cache keys, admin code shipping to visitors, publishes triggering bulk
regeneration — have all been thought about, and most are closed and provably
so. Row-level security is correct on every content table. The pure logic is
well covered.

Three things stop this being a clean bill of health:

1. **Images are served from Supabase**, against a 5 GB/month egress cap your
   CDN cannot help with. This is the first thing that will break at real
   traffic, and it will break as a bill or an outage, not a bug report.
2. **The sitemap contradicts your own SEO fields.** A blog post marked "hide
   from search" is still submitted for indexing. I introduced that a day ago
   and did not catch it.
3. **263 tests, and not one of them touches a route, an API or the database.**
   The pure modules are well protected. Everything built on top of them is
   protected by nothing.

Nothing here is architectural. All of it is fixable in a day or two.

---

## 2. Production readiness score

### **7 / 10**

- **9/10 architecture and safety design** — the cache discipline, the
  draft/publish contracts, the closed-set cache keys and the audit trail are
  better than most production sites I would expect to see at this stage.
- **7/10 correctness** — a handful of real bugs, none catastrophic, all found
  by reading rather than by anything failing.
- **4/10 verification** — the gap. Most of the dashboard has never run against
  your real database, and no test exercises a route.

For comparison: 7 means "deploy it, watch it, fix the three criticals this
week". It is not 5 ("something will break"), and it is not 9 ("ship and forget").

---

## 3. Critical issues — fix before, or immediately after, deploying

### C1. The sitemap submits pages you have marked `noindex` · **SEO**

`app/sitemap.ts` builds the blog block from `getBlogs()` and filters on nothing
but live status. `blog_posts.noindex` and `blog_posts.canonical_url` are not
consulted.

So a post you switch to "Hide from search" is **still submitted for indexing**,
and a post with a canonical pointing elsewhere is still advertised as the
original. Search Console reports this as "Submitted URL marked noindex" —
an error, on a signal you deliberately set.

This is my mistake: I added the fields and did not wire the sitemap to them.
Two lines.

### C2. Media served from Supabase Storage · **cost / availability**

`app/api/admin/media/route.ts` uploads to Supabase Storage and serves
`getPublicUrl()`, so every image loads from `*.supabase.co`. That is a
different origin from `cinetonight.com`, so **your Cloudflare CDN never sees
it and cannot absorb any of it**, and every view counts against 5 GB uncached
egress per month.

A movie site is mostly images. At 100k visitors this is the constraint that
bites first — well before the 500 MB database. Plan and required action are in
`docs/FREE-TIER-RETENTION-AND-MEDIA.md`; it needs an R2 bucket with a custom
domain from you before I can do anything.

### C3. Most of the dashboard has never met your real data · **verification**

Only the blog editor has been exercised against production Supabase. Homepage
Manager, Discovery Manager, Settings, Media, Activity, Redirects and Health
have been tested against an offline fallback and unit tests only.

Real data differs in the ways that break software: rows with nulls where the
type says string, older rows missing newer columns, a `cast_list` shaped
differently on titles synced months apart. **Not a bug — an unknown**, and the
cheapest way to close it is thirty minutes clicking every screen locally
against production Supabase before deploying.

### C4. Zero integration coverage · **testing / false confidence**

263 tests, all of them pure modules — `redirects`, `pathGuard`, `genres`,
`blogSeo`, `revalidatePlan`, `markdown`, `audit`. Every one of them can pass
while:

- an API route rejects a valid payload
- a Supabase query names a column that does not exist
- a dashboard screen crashes on a null
- RLS silently filters rows the admin key should have returned

The suite protects the *rules*. It protects none of the *plumbing*. Given the
plumbing is where the last four bugs actually were (the `snapshot()` retry, the
`GenericStringError` cast, the blog category early-return, the stale
`validator.ts`), that is where the risk is.

I am **not** recommending a large test-writing exercise. Three or four smoke
tests that hit each admin route with a valid payload against a scratch Supabase
project would catch most of it.

---

## 4. Medium issues — should fix

### M1. Rate limiting does not work on Cloudflare · **security**

`lib/rateLimit.ts` uses an in-memory `Map`. Its own comment says a single warm
instance only — but on Workers, **every isolate has its own map**, and isolates
are numerous and short-lived. The effective limit is therefore "N requests per
isolate", which for a distributed sprayer is close to no limit at all.

It protects `/api/comments` and `/api/subscribers` — both **public write
endpoints that insert rows into your 500 MB database**. A spam script could add
rows faster than you would notice.

Real options: a Cloudflare Rate Limiting rule at the edge (free tier includes
one rule), or a Turnstile challenge on the comment form. The edge rule is five
minutes and does not need code.

### M2. `redirects` has no cap on total rows · **database**

`MAX_ENABLED_RULES` (500) is enforced, but only on *enabled* rules. Bulk import
writes everything disabled, so repeated imports can add unbounded disabled rows
that no limit ever catches. Low likelihood, trivially fixed with a second cap.

### M3. `/movie/[id]` — soft 404 and in-range cache writes · **SEO + cost**

Both known, both documented in `docs/SEO-PHASE-4B-2.md`, both left alone at
your instruction. Restating so it is on one list:

- an invented id returns **200**, not 404 (crawl budget, Search Console soft
  404s)
- a well-formed, in-range but nonexistent id still writes one ~77 KB R2 object

The R2 lifecycle rule (30 days) closes the cost half without touching the
route. The status half needs the route-group move.

### M4. Blog revalidation still names a route that no longer caches · **cache**

`planFor({kind:"blog"})` returns `paths: ["/blog/<slug>", "/blog"]`, but
`/blog/[slug]` became `force-dynamic` in 4B-2 — so `revalidatePath` on it does
nothing for the page cache, while still writing a `_N_T_/blog/<slug>` row to
D1 on every publish.

Harmless (D1 rows are REPLACE-on-conflict and bounded by distinct slugs) but
wasteful and now misleading. The CDN purge for that URL is still correct and
must stay.

### M5. "What exists on this site" is computed in three places · **architecture**

`liveSlugs()` in the redirects API, the URL scanner in `/api/admin/media/usage`,
and `lib/linkGraph.ts` each independently enumerate what URLs are real. They
already disagree slightly in what they include. When a new content type is
added, whichever one is forgotten produces a wrong answer — a false "unused"
image, a missed shadow check, or a bogus broken-link report.

This is the clearest single-source-of-truth candidate left in the codebase.

### M6. Rename offers a redirect even for content that was never public

`offerRedirect` fires whenever a slug changes on an existing row, including a
draft nobody could ever have linked to. Creates a pointless enabled rule and
teaches you to dismiss a prompt that usually matters. Should be gated on the
post having been live.

### M7. `getMovies()` selects every column of every title · **performance**

`select("*")` including `cast_list`. Fine at 18 titles. At several hundred it
is a large payload on a query that runs inside the homepage, every listing
page, every movie page and the sitemap. It is cached, so it is one fetch per
TTL window rather than per request — but the cached object lives in R2 and the
payload is the object.

Worth a column list before the catalogue grows, not now.

---

## 5. Low priority

- **L1.** Redirect status labels are written out in both `lib/redirects.ts` and
  `RedirectsManager.tsx`. Cosmetic drift risk.
- **L2.** Next 16 warns that the `middleware` file convention is deprecated in
  favour of `proxy`. A warning today; it will become a break on a future
  upgrade. Do it deliberately, with Worker re-verification, not via the codemod
  in a hurry — that file holds the admin gate and the genre redirects.
- **L3.** D1 tag rows grow with distinct blog slugs. Bounded and replaced on
  conflict, so this is a note, not a risk.
- **L4.** `redirects` RLS allows public `SELECT` of enabled rules, so anyone
  with the anon key can enumerate your old URLs. Mildly informational; not
  sensitive.
- **L5.** No `robots` meta on `/signin` and `/signup`. They are disallowed in
  robots.txt and linked from the footer — the classic recipe for "indexed,
  though blocked". One line each.

---

## 6. Security review

**Verified correct — do not change:**

| Area | Finding |
| --- | --- |
| Admin gate | `middleware.ts` requires a Supabase session **and** membership of `admin_users` for `/admin/**` and `/api/admin/**`. A public signup cannot reach the dashboard. Verified in code. |
| Row-level security | Enabled on every content table. `blog_posts` and `pages` are `status = 'published'` only; `blog_upgrade.sql` correctly extends it to scheduled posts whose time has passed. **Drafts cannot leak through the anon key.** |
| `/api/debug` | Gated on `NODE_ENV === "production"`. **Verified live in the Worker — returns 404.** |
| Cron routes | Both require `Authorization: Bearer <CRON_SECRET>`. |
| Markdown | Escape-then-parse, with a scheme allowlist for links and images. No raw HTML passthrough. |
| Session cookie | `httpOnly` forced on, `secure` in production — a deliberate override of `@supabase/ssr`'s default. |
| Redirect destinations | Internal paths only. Absolute URLs are refused outright rather than reduced to a path (that reduction was a real hole, caught by a test). |
| Redirect sources | The home page cannot be redirected; a live page cannot be shadowed. |
| Path guard | Cannot throw, cannot query, runs before any Supabase work. |
| Admin JS | Absent from every public bundle — asserted at build. |

**Open:** M1 (rate limiting is ineffective on Workers). That is the only
security finding with real teeth, and it is a cost/spam problem rather than a
data-exposure one.

**Not reviewed:** the Supabase service-role key's storage in Cloudflare
secrets, and whether any old deploy preview still holds it. Worth checking that
`SUPABASE_SECRET_KEY` has never been committed to git.

---

## 7. SEO review

**Verified correct:**

- **robots.txt** — `/person/` is disallowed *only* for AI crawlers; Googlebot
  can crawl it, read the `noindex` and drop those pages. Checked line by line
  after it was reported as a global block; the report was mistaken.
- **Person pages** — `noindex, follow` + self-canonical + a real 308 collapsing
  all four URL forms. Verified in the Worker.
- **Genre URLs** — unknown and aliased values 308 to the canonical hub. One
  hop, verified live.
- **Soft 404** — root cause found (`loading.tsx` Suspense boundaries) and fixed
  on `/blog`, `/free-movies`, `/channel`, `/[slug]`, `/person`. Verified live:
  `/this-page-does-not-exist` returns 404 in production.
- **Sitemap** — no `/person/` URLs, `/discover` present, no aliased genre URLs,
  every entry returned 200 when swept.
- **Canonicals** — present on every indexable route; `cinetonight.com`, not
  localhost, confirmed on the live site.
- **Structured data** — Movie, BlogPosting, VideoObject, FAQPage,
  BreadcrumbList, Organization, WebSite all present.

**Open:**

- **C1** — sitemap ignores `noindex` and `canonical_url`. The one contradiction.
- **M3** — `/movie/[id]` soft 404.
- **L5** — `/signin`, `/signup` lack a `robots` meta.
- **Cannibalisation** — "Can't Decide What To Watch Tonight" and "What Should I
  Watch Tonight? How to Decide in 5 Minutes" target the same intent and will
  compete. Needs a content decision, not a code change.
- **The dated weekend URL** — will accumulate near-duplicates weekly unless it
  becomes one evergreen URL. Migration plan already written.
- **Pages have no SEO fields** — no per-page `noindex` or canonical. The
  unfinished half of 4B-4, and what migration B would have wanted.

---

## 8. Performance review

**Verified:** every public route's revalidate tier is unchanged from before all
this work (`/` 15m, `/discover` 1d, `/faq` 1d, `/free-movies` 1d, `/genres` 6h,
`/movie/[id]` 6h). `enableCacheInterception` is still `false` — the fix for the
production request loop. No admin JavaScript reaches a public bundle.

**Measured in the Worker:**

| Path | Cold | Warm |
| --- | --- | --- |
| 404 on an ISR route | ~50–60 ms | ~20 ms |
| 308 redirect | ~50 ms | ~20 ms |
| Real cached page | — | ~34 ms |

**Cost containment now in place:** invented URLs on `/blog/[slug]` and
`/free-movies/[slug]` create **zero** R2 objects (measured, was 10 per 10
requests). Malformed and out-of-range `/movie` ids likewise. The guard runs
before the Supabase client is even constructed.

**Remaining exposure:** in-range invented TMDB ids on `/movie/[id]`. Bounded at
20 million by the guard's ceiling rather than infinite, which is an improvement
and not a solution. The lifecycle rule is the cheap close.

**Watch at scale:** M7 (`select("*")` on movies), and the fact that `/blog` and
`/free-movies` detail pages now render per request — absorbed by the edge, but
Worker CPU rather than R2.

---

## 9. Database review

**Verified:** schema is additive throughout; every migration is idempotent and
safe to re-run; RLS correct on all content tables; the closed-set `check`
constraints on `redirects.status` and `redirects.reason` cannot drift from the
code because the code derives from the same lists.

**Growth, honestly assessed at "hundreds of posts, 100k visitors":**

| Table | Bounded? | Note |
| --- | --- | --- |
| `blog_revisions` | ✅ now | 20 per post + 90 days. Prunes on write, no scheduler needed |
| `page_revisions` | ✅ now | Same |
| `audit_log` | ✅ now | 180 days / 20,000 rows |
| config revisions | ✅ now | 30 each |
| `recently_viewed`, `sync_log` | ✅ now | 90 days |
| `redirects` | ⚠️ partly | Enabled capped at 500; **total uncapped** (M2) |
| `comments` | ❌ | Grows with traffic **and with spam** — see M1 |
| `subscribers` | ❌ | Legitimate growth, but the same weak rate limit |
| `media` | ❌ | Rows are small; the *files* are the problem (C2) |
| `movies` | ❌ | Legitimate; watch M7 |

**Missing indexes:** none critical. `retention.sql` adds the three the pruning
needs. `blog_posts (status, publish_at)` and `redirects (enabled)` exist.

**Data integrity:** `redirects.from_path` is `unique`, statuses and reasons are
`check`-constrained, revisions cascade on parent delete. No orphan risk found.

---

## 10. Deployment checklist

**Before**

1. ☐ Confirm `SUPABASE_SECRET_KEY` has never been committed to git
2. ☐ Run `supabase/redirects.sql` and `supabase/retention.sql` *(you have done this)*
3. ☐ **Click every dashboard screen locally against production Supabase** — the C3 gap, and the highest-value half hour on this list
4. ☐ `npx opennextjs-cloudflare build` → `node scripts/predeploy-check.mjs` → must be 4/4

**Deploy**

5. ☐ `npx opennextjs-cloudflare deploy`

**Within ten minutes**

6. ☐ Canonical on the homepage says `cinetonight.com`
7. ☐ `/this-page-does-not-exist` → 404
8. ☐ `/movie/tmdb-m-999999999` → 404 *(new — the path guard)*
9. ☐ `/movies?genre=made-up` → 308
10. ☐ `/admin` → System Health shows **9 files**, all green
11. ☐ `/admin` → Redirects loads; URL tester answers
12. ☐ Publish a one-word blog edit and confirm the live page updates within seconds *(this is still the only untested claim about the D1 tag cache)*

**First week**

13. ☐ R2 object count is not climbing unusually
14. ☐ Search Console: soft 404s falling, indexed count falling as person pages clear
15. ☐ Supabase egress — the number that tells you how urgent C2 is

---

## 11. Recommended next steps

**This week, in order:**

1. **C1 — sitemap respects `noindex` and `canonical_url`.** Two lines. It is a
   contradiction Google will report, and it is my bug.
2. **R2 lifecycle rule, 30 days.** Five clicks, closes M3's cost half.
3. **C3 — click through every screen against production Supabase.** Half an
   hour, and it converts the biggest unknown into either "fine" or a bug list.
4. **Deploy the batch.**

**Next:**

5. **M1 — a Cloudflare rate-limiting rule** on `/api/comments` and
   `/api/subscribers`. Edge config, no code, closes the only security finding
   with teeth.
6. **C2 — media to R2.** Blocked on your bucket and custom domain. This is the
   one that becomes urgent on its own schedule rather than yours.
7. **C4 — four smoke tests**, one per admin route family, against a scratch
   Supabase project.

**Then, and only then, new features:** Pages SEO fields, global SEO settings,
the cannibalisation decision, the weekend-post migration.

---

## 12. What I would push back on

If you asked me to deploy today with nothing fixed, I would say yes — with C1
done first, because it actively contradicts a signal you set, and it takes two
minutes.

Everything else on this list is either slow-moving (C2, M2, M7), already
mitigated (M3), or an unknown rather than a known fault (C3, C4). None of it
justifies delaying a deploy that is otherwise in good shape.

*Audit only. Nothing changed.*
