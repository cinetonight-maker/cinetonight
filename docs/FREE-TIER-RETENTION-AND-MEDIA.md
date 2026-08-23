# Supabase Free tier — retention, and getting media out of Supabase

**Date:** 22 August 2026 · **LOCAL ONLY — nothing deployed.**
`tsc` clean · `npm test` **251 / 251** · both builds OK · predeploy **4/4** ·
no cache setting, TTL or tier changed.

---

## The limits we are working inside

Supabase Free plan: **500 MB database**, **1 GB file storage**,
**5 GB uncached + 5 GB cached egress per month**, and projects can be paused
after a week of low activity
([costbench](https://costbench.com/software/database-as-service/supabase/free-plan/)).

Two separate problems against those numbers, and the second is the urgent one.

---

## Part 1 — Retention. Done.

### What was growing forever

| Table | What each row holds | Why it mattered |
| --- | --- | --- |
| `blog_revisions` | **a full copy of the article** | A 30 KB post edited 20 times = 600 KB of history for one post |
| `page_revisions` | a full copy of the page | Same shape |
| `audit_log` | before/after snapshots per admin action | Capped at 4 KB each, but one row per action forever |
| `homepage/discovery/settings_revisions` | full config snapshots | Smaller, still unbounded |
| `recently_viewed`, `sync_log` | one row per event | Unbounded |

Nothing ever deleted any of it. A hundred posts edited twenty times each is
~60 MB of revisions alone — **12% of the entire database, in history for
content that already exists elsewhere in full.**

### The policy

| Table | Kept |
| --- | --- |
| `blog_revisions` | **20 newest per post**, plus everything from the last 90 days |
| `page_revisions` | 20 newest per page, plus the last 90 days |
| `audit_log` | 180 days, and never more than 20,000 rows |
| `homepage_revisions` | 30 newest |
| `discovery_revisions` | 30 newest |
| `settings_revisions` | 30 newest |
| `recently_viewed` | 90 days |
| `sync_log` | 90 days |

**Per post, not global**, for content revisions. You want deep history for the
post you are editing today, not an even spread across posts you last touched a
year ago.

**Content is never touched.** Only history, and only history past the window
above. Posts, pages, media rows, settings, redirects and the catalogue are not
considered by any of it.

### Two mechanisms, because one was not enough

1. **Prune on write** — every time a revision is created, the oldest revisions
   for *that* post beyond 20 are removed. Deterministic, bounded, **needs no
   scheduler**. This matters: there is no cron trigger configured for this
   project, and a retention policy that depends on a scheduler nobody set up is
   not a policy.
2. **`prune_retention()`** in `supabase/retention.sql` — the weekly sweep that
   also covers `audit_log` and the event logs, which have no per-parent write
   to hang off. Scheduled by **pg_cron where the project has it**, and by a
   **"Run cleanup now" button on System Health** where it does not. The SQL
   file checks for pg_cron and skips silently rather than failing.

Both are best-effort by design: a housekeeping failure must never turn a save
the author already completed into an error.

### System Health, while I was in there

The checklist knew about **5 of 9** SQL files. It would have reported "all
done" with four migrations outstanding — the one thing that screen exists not
to do. It now covers `settings_cms`, `blog_seo`, `redirects` and `retention`
too, and carries the cleanup button with a plain-language explanation of
exactly what gets removed.

---

## Part 2 — Media is in Supabase, and that is the bigger risk

**`app/api/admin/media/route.ts` uploads to Supabase Storage** and serves
`getPublicUrl()`, so every image is delivered from `*.supabase.co`.

That means **every image view on your site is Supabase egress**, against 5 GB
uncached / 5 GB cached per month — and those URLs are a different origin from
`cinetonight.com`, so **your Cloudflare CDN never sees them and cannot absorb
any of it.** A movie site is mostly images. This is the constraint that bites
first, well before the 500 MB database.

You already pay nothing for R2 egress and already have a bucket and a
Cloudflare zone. Moving is clearly right.

### Why I have not done it yet

**It changes the URL of every image already published.** Doing it wrong shows
broken images across the live site, and unlike everything else this week it
cannot be fixed by a rollback — the old URLs would already be in article
bodies. It also needs one thing only you can do.

### The plan

**Step 1 — you: create a public R2 bucket and give it a hostname.**

```
npx wrangler r2 bucket create cinetonight-media
```

Then in Cloudflare → R2 → `cinetonight-media` → Settings → **Custom Domain**,
attach `media.cinetonight.com`. A custom domain (not the `r2.dev` URL) matters:
it is on your zone, so your CDN caches it, and it keeps the option of moving
providers later without touching a single stored URL.

**Step 2 — me: new uploads go to R2.** A binding in `wrangler.jsonc`, the
upload path switched to the R2 binding, `media.cinetonight.com` added to
`next.config.mjs` `remotePatterns`. The `media` table keeps doing its job —
it stores URLs, not files, so it barely changes.

**Step 3 — me: migrate the existing files.** A script that reads every row,
copies the object to R2, and rewrites the URL in `media`, in blog bodies, in
`image_url`, and in the homepage and discovery configs. Media Manager's
usage scanner already knows every place an image URL can appear, so the same
list drives the rewrite.

**Step 4 — both: verify, then delete from Supabase.** Old URLs keep working
throughout, because nothing is removed until every reference is repointed and
checked. **That is what makes this safe** — there is no window where an image
has moved but a page still points at the old address.

### One thing I need from you before designing Step 3 properly

**How many images are in the library, and how much space?** Open
**/admin/media** — the Files and Space-used tiles at the top say exactly. Under
a few hundred MB and this is one script and an afternoon. Much more and it
wants batching and a resume point.

---

## Also worth knowing

**The `redirects` table has no total-row cap** — only 500 *enabled*. Disabled
rows could accumulate from repeated bulk imports. Not urgent at your volume,
but if you ever import thousands, say so and I will add a cap.

**`comments` and `subscribers` grow with real usage.** That is legitimate
growth, not waste, so no retention on either — but they are the two to watch
if the database ever approaches the limit.

**Project pausing.** Free projects can be paused after a week of low activity.
Your cron and normal traffic should keep it awake, but it is worth knowing that
"the dashboard suddenly cannot connect" has a boring explanation.

---

## What you need to run

Two SQL files, in Supabase → SQL Editor:

```
supabase/redirects.sql     the Redirect Manager (from 4B-3)
supabase/retention.sql     this policy, plus the weekly sweep
```

Then rebuild and deploy as usual. After deploying, open **System Health** —
the checklist now lists all nine files and tells you which are still
outstanding.

*Nothing deployed. No content touched.*
