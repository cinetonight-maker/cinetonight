# Publishing a blog post — the workflow, and what changed to support it

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed.**
`tsc` clean · `npm test` **219 / 219** · both builds OK · predeploy **4/4** ·
no cache setting, TTL or tier changed.

---

## What was missing

I checked your guidelines line by line against what the editor could actually
store. Five of them had no field behind them, which meant an SEO-ready article
needed a code change — the exact thing this dashboard exists to remove.

| Your rule | Before | Now |
| --- | --- | --- |
| One H1, H2 sections, H3 only deeper | Nothing checked it | **Checked live as you type** |
| Correct category, create one if missing | Existed | Existed, now on the checklist |
| Evergreen URLs, no dates | Nothing checked it | **Warns on a dated slug** |
| **Focus keyword** | **No field** | **New field + six checks measured against it** |
| SEO title | Existed | On the checklist with a length warning |
| Meta description | Existed | On the checklist with a length warning |
| **Canonical** | **No field** | **New field, behind a confirmation** |
| **OG image** | **No field** | **New field, falls back to the featured image** |
| Natural internal links | Internal Links module, after the fact | **Counted in the editor, before publish** |
| Check preview before publishing | Existed | Existed |
| Confirm image, URL, SEO, structure | By memory | **The checklist is that confirmation** |

Two more were added because they belong with the rest: **secondary keywords**
(a planning aid, and the article's keyword meta tag) and a per-article
**hide from Google** switch.

---

## The publish checklist

The editor now shows fifteen checks, recomputed as you type. It is pure,
synchronous code (`lib/blogSeo.ts`) — no network call, no cost, no delay.

**It warns, it does not block.** A checklist that refuses to publish is one
people learn to route around. The only hard stops remain the ones the API
already enforced: no title, duplicate slug.

What it measures:

- **Structure** — exactly one H1, at least one H2, no skipped levels. A `#`
  inside a code fence is not counted, so a snippet never triggers a false alarm.
- **Length** — under 300 words fails, under 600 warns.
- **Focus keyword** — in the title, the meta description, the URL, the opening
  paragraph, and at least one H2. Five separate rows, so you can see which one
  is missing instead of a single vague score.
- **Snippet lengths** — title over 60 characters, description outside 120–160.
- **Artwork** — featured image present, alt text present.
- **Category** and **internal links** (two or more).
- **Evergreen URL** — warns if the slug contains a year or a month name.
- **The dangerous switches** — if `noindex` or a canonical override is on, it
  says so in plain language, every time.

A passing row shows no advice. Telling you how to fix something already correct
is how a checklist stops being read.

One bug the tests caught while building this: the URL check compared
`cant-decide-what-to-watch-tonight` against the phrase `can't decide what to
watch tonight` as plain text and failed — it would have told you to fix a URL
that was already perfect. Slugs never contain apostrophes, so the comparison
now happens in slug space.

---

## Before any of it works: one SQL file

Supabase → SQL Editor, paste, Run. **`supabase/blog_seo.sql`** — five columns
on `blog_posts`, five matching ones on `blog_revisions` (a revision that cannot
restore the SEO fields is not a restore point), one index.

Additive and idempotent, like the other seven. Until it is run, the new fields
simply are not saved and everything else works exactly as before — the API
retries the write without them rather than failing the save.

That brings the outstanding list to eight files. System Health tells you which
are still missing.

---

## Your first post

**Can't Decide What To Watch Tonight? Movies For Every Mood**

Scored against the new checklist: **all 15 checks pass.**

```
OK  Heading structure                        OK  SEO title — 57 characters
OK  Length — 636 words                       OK  Meta description — 147 characters
OK  Focus keyword — "can't decide…"          OK  Featured image
OK  …in the title                            OK  Featured image alt text
OK  …in the meta description                 OK  Category
OK  …in the URL                              OK  Internal links — 7
OK  …in the opening paragraph                OK  Evergreen URL
OK  …in at least one H2
```

### What I changed from your draft, and why

Your structure and angle were right; I did not touch either. The edits were:

- **Added an H2 carrying the focus keyword** ("Still Can't Decide What To Watch
  Tonight?") and worked the phrase into the opening paragraph. Neither appeared
  in the draft, and both are on your own guideline list.
- **Added seven internal links** where the draft said "explore CineTonight
  discovery options" without linking anywhere: `/discover` (twice, including
  the closing call to action), `/movies?genre=Comedy`, `/movies?genre=Thriller`,
  `/movies?genre=Drama`, `/trending`, `/free-movies`, `/web-series`. Every one
  sits inside a sentence that was already making that point.
- **Grew it from ~380 to 636 words.** The draft's sections were single lines;
  each now has a reason to exist. Nothing was padded — the bullet lists are
  yours, unchanged.
- **Added an opening H2** ("Start With Your Mood, Not The Catalogue") so the
  first section is not a mood category, which read as an abrupt start.

### Fields to paste into the editor

| Field | Value |
| --- | --- |
| Title | Can't Decide What To Watch Tonight? Movies For Every Mood |
| URL | `cant-decide-what-to-watch-tonight` |
| Category | Guides |
| Focus keyword | `can't decide what to watch tonight` |
| Secondary keywords | movies to watch tonight, what movie should i watch, movies when you don't know what to watch, movies based on mood |
| Meta title | same as the title (57 characters) |
| Meta description | Can't decide what to watch tonight? Find movies based on your mood, from relaxing and funny picks to thrillers, emotional stories, and hidden gems. |
| Tags | mood, what to watch, recommendations, discover |
| Image alt | Someone scrolling a streaming app, unable to decide what to watch |
| Status | Scheduled |
| Publish at | 22 Aug 2026, 09:00 |
| Canonical / OG image / noindex | leave blank / blank / allow |

Body: `content/posts/cant-decide-what-to-watch-tonight.md`.

**Still to do — the featured image.** It is the one field I cannot fill: upload
one in Media Library and pick it. Something with a person and a screen rather
than a film-strip stock photo. The checklist will go from 14 to 15 when it is set.

### Scheduling it

I could not do it for you — **Supabase is not reachable from this sandbox**
(outbound is blocked here, same as TMDB). Two ways to land it:

1. **The dashboard** — Blog Posts → New post, paste the fields above, set
   Status to Scheduled and the date to 22 Aug 09:00, check Preview, Save.
   **This is the workflow the whole exercise is about**, and it is worth doing
   once by hand so you know it works end to end.
2. **`supabase/seed_post_cant_decide.sql`** — paste and Run, and it lands
   scheduled with every field set. Re-running updates rather than duplicating.
   Change the `publish_at` line for a different slot. Use this only if you want
   it in without typing.

Either way, open **Preview** before it goes live, and add the featured image.

---

## Future internal linking opportunities

Your guidelines ask for these to be noted where the target does not exist yet.
This article wanted to link to four things you have not written:

1. **"Best short movies under 90 minutes"** — the short-time section links to
   `/free-movies` because there is nothing better to point at.
2. **"Korean films to start with"** — the "something different" section names
   Korean cinema and has nowhere to send anyone. `/channel/viki` is the closest
   existing page.
3. **"How to pick a film when nobody agrees"** — the comedy section makes the
   group-viewing argument and stops there.
4. **"Hidden gems"** as a standing page rather than a phrase.

Each is a natural follow-up post, and each would give this one a stronger
outbound link. The Internal Links screen will show this article as a dead end
for those topics once they exist.

---

## Where this sits in the plan

This is **4B-4 (the blog half) pulled forward** — you asked for it, so it moved
ahead of 4B-2 and 4B-3. Still outstanding, unchanged:

- **4B-2** — R2 junk-object containment on `/blog/[slug]` and
  `/free-movies/[slug]` (`/movie/[id]` still waiting on your analytics review)
- **4B-3** — the Redirect Manager
- **4B-4 remainder** — the same SEO fields for Pages
- **4B-5** — global SEO settings
- **4B-6** — full regression audit, then the first deploy

---

## Files

**New:** `lib/blogSeo.ts`, `supabase/blog_seo.sql`, `tests/blogSeo.test.mjs`,
`content/posts/cant-decide-what-to-watch-tonight.md`,
`supabase/seed_post_cant_decide.sql`, this document.

**Changed:** `components/admin/BlogManager.tsx`, `app/api/admin/blog/route.ts`,
`app/blog/[slug]/page.tsx`, `lib/data.ts`, `lib/types.ts`.

**Untouched:** every cache setting, every TTL, `open-next.config.ts`,
`wrangler.jsonc`, `next.config.mjs`, `middleware.ts`, `app/movie/[id]/`.

*Nothing deployed.*
