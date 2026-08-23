# Final deployment checklist

**Date:** 22 August 2026 · `tsc` clean · `npm test` **265 / 265** ·
`next build` OK · `opennextjs-cloudflare build` OK · predeploy **4/4**.

The C1 sitemap fix is in. Nothing else was built.

---

## What changed since the audit

**C1 — the sitemap no longer contradicts your SEO fields.**

Two parts, because the first alone would have done nothing:

1. `app/sitemap.ts` now filters out any post with `noindex` set, or with a
   canonical pointing elsewhere. A sitemap entry is a *request to index*; it
   must never argue with the page it points at.
2. `getBlogs()` now actually selects `noindex` and `canonical_url`. It did not
   before — `BLOG_LIST_COLUMNS` deliberately excludes heavy fields, so the
   filter would have read `undefined` on every post and silently done nothing.

The new columns are selected with a **fallback to the base column list**, because
naming a column that does not exist fails the whole query — which would blank
the blog on an install that has not run `blog_seo.sql`. Two fixed query URLs, so
the data cache stays bounded.

Two tests added, both asserting the *pair* — that the sitemap filters, and that
the query supplies what it filters on. Half a fix here is worse than none,
because it looks done.

---

## Step 1 — Cloudflare, before deploying (5 minutes, no code)

### 1a. R2 lifecycle rule

Cloudflare → **R2** → `cinetonight-cache` → **Settings** → Object lifecycle
rules → **Add rule**:

- Applies to: **all objects**
- Action: **Delete objects** after **30 days**

This closes the remaining `/movie/[id]` cost exposure without touching the
route. It fits how ISR behaves: a page with real traffic is rewritten on every
revalidation so its age keeps resetting and it never expires — a junk object is
written once, never touched, and ages out. **The rule removes exactly what
nothing is using.**

☐ Done

### 1b. Confirm the Worker variables

Cloudflare → Workers & Pages → **cinetonight** → Settings → Variables:

- ☐ `NEXT_PUBLIC_SITE_URL` = `https://cinetonight.com`
- ☐ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- ☐ `TMDB_API_KEY` or `TMDB_READ_TOKEN`
- ☐ `CRON_SECRET`

---

## Step 2 — Verify every dashboard module against real Supabase

**This is the highest-value half hour on the list.** It is audit finding C3:
only the blog editor has ever run against your production data. Everything else
has been exercised against unit tests and an offline fallback.

```
npm run dev
```

Open `/admin` and work through each screen. For each, the question is only
*"does it load and does one action work"* — not a deep test.

| # | Screen | Check | Note anything wrong |
| --- | --- | --- | --- |
| ☐ | **System Health** | Setup checklist shows **9 files**, all green. If any says outstanding, that SQL did not take | |
| ☐ | **Overview** | Loads with real figures, no blank tiles | |
| ☐ | **Blog Posts** | Open a post; the Publish checklist renders; Focus keyword field is there; make a one-word edit and save | |
| ☐ | **Blog Posts** | Open **History** on a published post — revisions listed | |
| ☐ | **Pages** | List loads; open one; save; History works | |
| ☐ | **Homepage** | Loads live + draft; reorder a section; **Preview**; discard without publishing | |
| ☐ | **Discovery** | Loads; toggle a mood off; **Preview**; discard | |
| ☐ | **Redirects** | Loads. URL tester on `/blog/does-not-exist` says "no rule". Add `/test-delete-me` → `/blog`, confirm it saves **switched off**, then delete it | |
| ☐ | **Internal Links** | Report generates | |
| ☐ | **Media Library** | Files and space tiles show numbers — **write both down**, they decide the media migration plan | |
| ☐ | **Activity Log** | Entries listed; filters work; open one entry's detail | |
| ☐ | **Settings** | Loads; History opens; do **not** publish | |
| ☐ | **Comments / Navigation / Sync / Movies / Free Movies** | Each loads without an error banner | |

**If any screen errors, stop and send me the message.** A screen that fails
here would fail identically in production, and this is the cheap place to find
out.

---

## Step 3 — Build and deploy

Three commands, one at a time:

```
npx opennextjs-cloudflare build
```

```
node scripts/predeploy-check.mjs
```

**Must print 4/4.** If not, stop and send it to me.

```
npx opennextjs-cloudflare deploy
```

---

## Step 4 — Verify production (10 minutes)

```
curl -s -o NUL -w "%{http_code}\n" https://cinetonight.com/this-page-does-not-exist
curl -s -o NUL -w "%{http_code}\n" https://cinetonight.com/movie/tmdb-m-999999999
curl -s -o NUL -w "%{http_code} -> %{redirect_url}\n" "https://cinetonight.com/movies?genre=made-up"
curl -s https://cinetonight.com/sitemap.xml | findstr /c:"/person/" /c:"/discover"
```

Expected: **404**, **404** *(new — the path guard)*, **308 → /movies**, and only
a `/discover` line with nothing containing `/person/`.

Then in a browser:

- ☐ `https://cinetonight.com` loads; view source, `rel="canonical"` says
  **cinetonight.com**, not localhost. *If it says localhost, stop and fix
  `NEXT_PUBLIC_SITE_URL`, then redeploy — every hour with a wrong canonical is
  an hour of Google reading broken tags.*
- ☐ `/blog`, `/discover`, a movie page, `/free-movies` all load
- ☐ `/admin` → System Health: 9 files green
- ☐ `/admin` → Redirects loads
- ☐ **Publish a one-word blog edit and reload the live post.** If it updates in
  seconds, the D1 tag cache is working. This is still the only claim in the
  whole system that has never been proven end to end.

**If anything breaks:** Cloudflare → Workers → cinetonight → Deployments →
previous version → **Rollback**. Instant, no rebuild. Diagnose afterwards.

---

## Step 5 — First week

- ☐ Resubmit the sitemap in Search Console
- ☐ Watch Soft 404 reports fall
- ☐ **Expect Indexed pages to drop sharply** as person pages clear — that is
  the plan working, not a fault. Do not add a robots.txt block to "help"; it
  would freeze those URLs in the index permanently
- ☐ Cloudflare → R2: object count should be flat or falling
- ☐ Supabase → Usage: note the **egress** figure. That number decides how
  urgent the media migration is

---

## After deployment — agreed order

1. **Cloudflare rate limiting** — `/api/comments` and `/api/subscribers`. Edge
   config, no code. Closes the only security finding with real teeth: the
   in-memory limiter does not work across Worker isolates, and both routes
   insert rows into a 500 MB database.
2. **Media → R2** — blocked on you creating `cinetonight-media` with the custom
   domain `media.cinetonight.com`, and on the file count from Step 2.
3. **`/movie/[id]` SEO** — the route-group move for a real 404, and the
   force-dynamic decision once you have the analytics.
4. **Integration tests** — four smoke tests, one per admin route family,
   against a scratch Supabase project. Closes C4.

---

## Known and accepted going into this deploy

| Item | Why it is acceptable today |
| --- | --- |
| `/movie/[id]` returns 200 for an invented id | Crawl-budget cost, not a correctness or money problem. Fixing it does **not** reduce R2 writes — measured separately |
| In-range invented TMDB ids still write one R2 object | Bounded by the guard's ceiling, and the lifecycle rule caps the storage |
| Media served from Supabase | The real clock on this release. Watch the egress number |
| Rate limiting ineffective on Workers | Public write endpoints, spam risk. First job after deploying |
| `redirects` total rows uncapped | Only reachable through repeated bulk imports; you have none |
| No integration tests | An unknown, not a known fault |
| Two "what to watch tonight" posts compete | Content decision, no code involved |

---

*The sitemap fix is the only code change since the audit. Nothing else was
built.*
