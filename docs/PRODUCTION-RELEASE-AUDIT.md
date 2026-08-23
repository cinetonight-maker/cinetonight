# Production release audit

**Date:** 21 August 2026 · **AUDIT ONLY — no code changed.**
`npm test` **219 / 219** · `tsc` clean · no cache setting, TTL or tier changed.

**Verdict: deployable, once three blockers are cleared.** None of them is code.
Details in §5 and §7.

---

## 0. Three blockers — clear these or the deploy is wrong

| # | Blocker | What happens if you skip it |
| --- | --- | --- |
| 1 | `wrangler.jsonc` line 38 still says `REPLACE_WITH_D1_DATABASE_ID` | The deploy is rejected, or the D1 binding is dead and every Publish silently fails to refresh the cache |
| 2 | `NEXT_PUBLIC_SITE_URL` must be set on the Worker | **Every canonical tag, OG URL and sitemap entry bakes in `http://localhost:3000`.** This is the single most damaging thing that can go out |
| 3 | The 7 SQL files must be run in Supabase | Four dashboard modules refuse to load (they say which file to run). The public site is unaffected |

Number 2 is the one to double-check. The code logs a loud error in production if
it is missing, but the pages still render — with the wrong domain baked in.

---

## 1. SQL migrations — ready and documented?

**Yes, with one documentation gap.** Seven required files, all additive, all
idempotent, all safe to re-run, none touching existing data.

| File | Unlocks | Required? |
| --- | --- | --- |
| `blog_cms.sql` | Trash, version history, autosave recovery, tags, image alt | Blog features degrade without it |
| `pages_cms.sql` | Trash, version history, page SEO fields | Pages features degrade without it |
| `audit_log.sql` | The whole Activity Log | **Module fails without it** |
| `homepage_cms.sql` | Homepage Manager | **Module fails without it** |
| `discovery_cms.sql` | Discovery Manager | **Module fails without it** |
| `settings_cms.sql` | Settings draft/publish/history | Saving works; history does not |
| `blog_seo.sql` | Focus keyword, canonical, OG image, noindex | New fields silently not saved without it |

Optional: `seed_post_cant_decide.sql` — schedules the first article. Not a
migration; skip it if you publish through the dashboard instead.

Already run previously (pre-CMS): `schema.sql`, `blog_upgrade.sql`,
`classics.sql`, `sync_upgrade.sql`, `seed_legal_pages.sql`.

### Gap found — worth fixing, but not a blocker

**System Health's setup checklist only knows about 5 of the 7.** It checks
`blog_cms`, `pages_cms`, `audit_log`, `homepage_cms`, `discovery_cms` — and is
missing `settings_cms` and `blog_seo`. So the screen that exists to tell you
what is outstanding will report "all done" while two files are still unrun.

Two rows in `app/api/admin/health/route.ts`. Say the word and I add them.

---

## 2. What works without SQL, and what does not

**The public site works fully without any of it.** Verified in code: the
homepage, discovery and settings readers all fall back to the shipped defaults
on a missing table, a missing row, or any error at all. A visitor cannot tell
whether the migrations have been run.

| Module | Without SQL |
| --- | --- |
| Overview | ✅ Works |
| Blog Posts | ⚠️ Editing and publishing work. Trash, history, autosave recovery, tags, alt text and the new SEO fields are silently skipped — the API retries the write without those columns rather than failing your save |
| Pages | ⚠️ Same pattern |
| Internal Links | ✅ Works |
| Movies & Series, Free Movies | ✅ Works |
| Homepage Manager | ❌ **Fails** — "Run supabase/homepage_cms.sql… Nothing on the site is affected until you do." |
| Discovery Manager | ❌ **Fails** — same message, its own file |
| Media Library | ✅ Works |
| Navigation, Sync Center, Comments | ✅ Works |
| Activity Log | ❌ **Fails** — needs `audit_log.sql` |
| System Health | ✅ Works — this is the screen that tells you what is missing |
| Settings | ⚠️ Saving works. Draft, history and rollback need `settings_cms.sql` |

The failure messages are specific and name the file, so a half-migrated
database is confusing but never dangerous.

---

## 3. Breaking URL changes?

**No URL was removed, renamed or broken.** Confirmed against the build output.

The route-group moves in 4B-1 look alarming in a file listing but change
nothing: a `(folder)` is excluded from the path. `app/(home)/page.tsx` is still
`/` at 15m, `app/blog/(index)/page.tsx` is still `/blog` at 10m.

**New redirects — all deliberate, all one hop, all verified as real 308s:**

| From | To | Why |
| --- | --- | --- |
| `/person/tmdb-p-<id>` and any slug variant | `/person/tmdb-p-<id>-<name>` | One URL per person |
| `/person/<name>` | `/person/tmdb-p-<id>-<name>` | Same |
| `/movies?genre=<unknown>` | `/movies` | Closes an unbounded duplicate space |
| `/movies?genre=Action & Adventure` | `/movies?genre=Action` | TMDB's TV-side name did not filter a movie query |
| `/movies?genre=All` and `?genre=` | `/movies` | Tidy-up |

Unchanged from before: `/p/:slug` → `/:slug`, `/pricing` → `/`.

### One index change you should expect, and it is intended

The ~50 `/person/<name>` URLs your sitemap used to submit will now **308 to a
page marked `noindex`**. They will drop out of Google's index over the coming
weeks. That is the whole point of the person work — but it will look like
"pages disappearing" in Search Console, so it is worth knowing in advance.
Expect **Indexed pages to fall sharply** as the person pages (46% of the sample)
clear out. That is success, not a regression.

**Status-code changes** (200 → 404) on invented URLs: `/this-page-does-not-exist`,
`/channel/not-a-channel`, `/free-movies/<unknown>`, `/blog/<unknown>`,
`/person/tmdb-p-<invented>`. No real page is affected.

---

## 4. Database schema changes

**Additive only. Nothing dropped, nothing renamed, no data modified.**

New tables: `blog_revisions`, `page_revisions`, `audit_log`, `homepage_config`,
`discovery_config`, `site_settings_revisions`.

New columns on `blog_posts`: `deleted_at`, `image_alt`, `draft_body`,
`draft_saved_at`, `tags`, `focus_keyword`, `secondary_keywords`,
`canonical_url`, `og_image`, `noindex`.

New columns on `pages`: trash, draft and SEO fields per `pages_cms.sql`.

Every added column is nullable or has a default, so the schema is valid for
existing rows the instant it lands. **Every file is safe to run twice.**

---

## 5. Cache invalidation and production secrets

This is where the real deployment risk lives.

| Secret | Needed for | If missing |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonicals, OG URLs, sitemap, JSON-LD | **Localhost baked into every SEO tag.** Blocker |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | The site's content and the whole dashboard | Site falls back to the bundled snapshot; dashboard dead |
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | Live rows, movie pages, channels | Falls back to the 18-title catalogue |
| D1 `database_id` in `wrangler.jsonc` | On-demand revalidation after Publish | **Blocker** — see §0 |
| `CACHE_PURGE_ZONE_ID`, `CACHE_PURGE_API_TOKEN` | Single-file CDN purge after Publish | Optional. Publishing still works; the page refreshes on its next natural rebuild instead of within seconds |
| `CRON_SECRET` | Scheduled catalogue refresh, Telegram digest | Those cron routes refuse to run |
| `TELEGRAM_*`, `NEXT_PUBLIC_GA_ID`, `AMAZON_ASSOCIATES_TAG` | Optional extras | Feature simply off |

**Cache architecture itself is unchanged.** `enableCacheInterception` is still
`false`, R2 incremental cache, regional cache and every TTL are exactly as
before. The only addition is the filtered CMS-only D1 tag layer, audited
separately in `docs/CMS-CACHE-LAYER-AUDIT.md`.

**Failure behaviour is already correct:** if D1 or the purge API is unavailable,
the publish still succeeds and the dashboard says "published — cache refresh
delayed" rather than reporting a failure. That was fixed during the cache audit.

---

## 6. Known bugs and open items

Ranked by what they cost you.

| # | Item | Severity | Status |
| --- | --- | --- | --- |
| 1 | **ISR routes mint one permanent R2 object per invented URL** — `/movie/[id]`, `/blog/[slug]`, `/free-movies/[slug]`. Measured: 20 junk URLs → 20 objects, ~137 KB each | **High (cost)** | 4B-2. **Already true on the live site today** — this release does not make it worse |
| 2 | `/movie/[id]` still returns **200** for an invented id (soft 404) | Medium | Deliberately deferred, waiting on your Cloudflare analytics |
| 3 | System Health checklist missing `settings_cms` and `blog_seo` | Low | Two lines, not yet fixed (§1) |
| 4 | Renaming a blog or page slug still breaks every link to it | Medium | 4B-3, the Redirect Manager |
| 5 | Next 16 warns: `"middleware" file convention is deprecated, use "proxy"` | Low | Warning only today. Will need renaming before a future Next upgrade |
| 6 | **Nothing has ever run against your real Supabase** | Medium | Only you can clear this — see §7 |
| 7 | Live TMDB paths never exercised — **TMDB is unreachable from this sandbox** | Medium | Person redirect proven with an injected fixture; live resolution unproven |
| 8 | Person `noindex` will take weeks to clear the index | Expected | Do not "help" by adding a robots.txt block — that freezes the URLs in the index permanently |

Nothing on this list is a functional defect in what is about to ship. Items 1
and 2 are pre-existing; 3, 4 and 5 are unfinished work, not breakage.

---

## 7. Deployment checklist

### Before you deploy

1. ☐ Delete the six old files — **you have done this**
2. ☐ Run the 7 SQL files in Supabase → SQL Editor
3. ☐ Open **System Health** and confirm the checklist is green (remembering it
   does not yet know about `settings_cms` or `blog_seo` — check those by hand)
4. ☐ `npm install && npm run build && npm run dev` — click through every
   dashboard screen against the **real** Supabase. This is the first time the
   code meets your actual data, and it is the highest-value step on this list
5. ☐ Create the D1 database: `npx wrangler d1 create cinetonight-tags`, paste
   the id over `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`
6. ☐ Confirm **`NEXT_PUBLIC_SITE_URL=https://cinetonight.com`** is set on the
   Worker, along with the Supabase and TMDB secrets
7. ☐ Optional: `CACHE_PURGE_ZONE_ID` and a Cache-Purge-only API token

### Deploying

8. ☐ **`npx opennextjs-cloudflare build`** — `deploy` does NOT rebuild. This is
   the mistake the gate exists to catch, and it caught it again during this
   audit
9. ☐ `node scripts/predeploy-check.mjs` — must be **4/4 green**
10. ☐ `npx opennextjs-cloudflare deploy`

### Within ten minutes of deploying

11. ☐ `https://cinetonight.com/` loads; `/blog`, `/discover`, `/free-movies`,
    a movie page, a channel page
12. ☐ **View source on any page — confirm the canonical says `cinetonight.com`,
    not `localhost`.** If it says localhost, stop and fix `NEXT_PUBLIC_SITE_URL`
13. ☐ `/sitemap.xml` — no `/person/` URLs, `/discover` present
14. ☐ `/robots.txt` — unchanged
15. ☐ `/this-page-does-not-exist` returns **404**, not 200
16. ☐ `/movies?genre=made-up` returns a **308** to `/movies`
17. ☐ Sign into `/admin`, publish one small change, confirm it appears within
    seconds (that is the D1 layer working)
18. ☐ Cloudflare → R2 → confirm object count is not climbing unusually

### First week

19. ☐ Search Console → resubmit the sitemap
20. ☐ Watch Soft 404 reports fall
21. ☐ Expect **Indexed pages to drop sharply** as person pages clear — that is
    the intended outcome, not a problem

---

## 8. Rollback plan

**The code:** Cloudflare keeps previous Worker versions. Roll back from the
Cloudflare dashboard (Workers → cinetonight → Deployments → the previous
version → Rollback), or `npx wrangler rollback`. This is instant and needs no
rebuild. **This is your fastest lever — use it first and diagnose afterwards.**

**The database:** nothing to roll back. Every migration is additive; leaving the
new tables and columns in place is harmless even on the old code, because the
old code never reads them.

**The content:** every module has draft → publish → rollback with version
history and an audit trail. Homepage, Discovery, Settings, Blog and Pages can
each be reverted from the dashboard without a deploy.

**The redirects:** they are in code, so backing one out is a deploy. Person and
genre redirects are the only two, and both are one-hop and reversible.

**If canonicals came out wrong:** set `NEXT_PUBLIC_SITE_URL` and redeploy. Do
not wait — every hour with a localhost canonical is an hour of Google reading
broken tags.

**If R2 objects climb unexpectedly:** that is item 1 in §6, not a new problem.
The containment work is 4B-2 and can ship separately.

**What is NOT reversible:** Google's re-crawl. Once the person pages are
noindexed and re-crawled, bringing them back means re-indexing from scratch.
That is the one decision worth being sure about before deploying — and it was
approved twice, on evidence.

---

## 9. What I need from you

1. **Run the 7 SQL files and test locally against real Supabase** (checklist
   step 4). Nothing in this project has met your real data yet.
2. **Cloudflare analytics for `/movie/*`** — request volume and cache hit ratio.
3. **Say the word on the System Health gap** — two rows, two minutes.

*Audit only. No code changed. Nothing deployed.*
