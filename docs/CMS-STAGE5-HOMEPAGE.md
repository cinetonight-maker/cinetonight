# CMS Major Update — Stage 5: Homepage Manager

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed**

`tsc` clean · `npm test` **146 / 146** (13 new) · `next build` OK ·
`opennextjs-cloudflare build` OK · `predeploy-check` **4/4** ·
`enableCacheInterception` still `false` · no admin JS in any public bundle ·
homepage still ISR at 15 min (unchanged).

Also in this batch: the **audit entry detail page** you asked for.

---

## Part A — Activity entry detail

`/admin/activity/<id>` — its own URL, so an entry can be bookmarked or shared
while you are investigating something. Reached from **Open** on any row.

Shows: the action and module, the item, **who** did it (from their signed-in
session), the exact timestamp plus how long ago, the entry id, the recorded
note, and a **before/after table** — changed fields highlighted, with a toggle
to show every field rather than only the differences.

### "Can this be undone?"

Answered from the database rather than guessed, using three facts:

1. does the item still exist, or was it permanently deleted?
2. does its module keep version history at all?
3. is there a snapshot from at or before that moment?

So you get *"Yes — 3 saved versions exist from before this change"*, or the
actual reason it cannot be undone.

**It reports availability; it does not perform the rollback.** You do that from
the item's own History. That is deliberate: a rollback is a content change, and
content changes are logged — triggering one from inside the log would make the
log act on itself. Both activity routes export `GET` and nothing else, and a
test fails the build if a mutating handler, or any `.insert/.update/.delete/
.upsert`, ever appears in them or if the detail screen sends a mutating request.

---

## Part B — Homepage Manager

The first **configuration manager**, built to the blueprint: *current live
version · draft changes · preview · publish · rollback*, plus an audit row.

### What you can change

| | |
| --- | --- |
| **Hero artwork** | Pick up to 8 titles, or leave empty for automatic |
| **Section order** | Move any section up or down — that is the page order |
| **On / off** | Any of the six movable sections |
| **Headings** | Title and sub-heading for Trending, Guides and the Newsletter block |
| **Counts** | Trending 4–12 titles, Guides 2–6 posts |

Automatic hero is the default and usually the right answer: a manual pick goes
stale, an automatic one never does.

### What you deliberately cannot change

The **hero question**, **Quick Picks**, **moods** and the **single
recommendation**. That spine is locked by the Phase 3 design — the homepage is
a decision engine, not a catalogue, and making the spine switchable would let
one wrong click turn it back into the shelf-stack it stopped being. The preview
shows those blocks marked **Fixed** so the page is still legible end to end. A
test asserts they never appear in the configurable list.

### Editing changes nothing until you publish

The public homepage reads `live_config`. Everything on the screen writes
`draft_config`. They are different columns, so an unpublished edit cannot reach
a visitor — the same structural guarantee that makes blog drafts safe. The
draft autosaves every 2.5 seconds and the screen warns before you leave with
unpublished changes.

**Publish** snapshots the version it replaces *first*, swaps draft → live,
revalidates `/` and nothing else, and writes one audit row.

**Rollback loads an old version as a DRAFT, not straight to the site.** You
preview it and publish it deliberately. A rollback that went live instantly
would be the only un-previewable action in the whole CMS.

### Preview — and an honest limit

`/admin/preview/homepage` is force-dynamic, admin-only, `noindex`, and reads
the database with no caching. It shows exactly which sections appear, in what
order, with your headings and counts, and says plainly whether the draft
differs from what is live.

**It is a structure preview, not a pixel render.** Re-rendering the real rails
would fire the homepage's entire TMDB and Supabase workload on every preview —
the opposite of what the one-TMDB-request data budget in `app/page.tsx` exists
to protect. The things a pixel preview would add — the artwork and the card
layout — are the things you cannot change from this screen anyway.

### Nothing can blank the homepage

`normalizeConfig()` forces whatever is stored into something renderable:
unknown sections dropped, missing ones appended in their default position,
counts clamped, headings length-bounded, empty headings falling back to the
shipped text, hero picks de-duplicated and capped at 8. `getHomepageConfig()`
falls back to the shipped default on any problem — table missing, row empty,
Supabase unreachable. Thirteen tests cover exactly these cases, including
feeding it `null`, `"a string"`, `0` and `[]`.

Publishing an all-sections-off homepage is refused before it happens.

### Cache impact

`cms:homepage` + `/` + one CDN URL. **One route, one rebuild, one R2 write.**
Nothing else is touched — asserted by the blast-radius test alongside blog and
pages. Homepage ISR stays at 15 minutes; the tag simply means Publish refreshes
it immediately instead of waiting.

---

## Files

**New:** `supabase/homepage_cms.sql` · `lib/homepageConfig.ts` ·
`lib/homepage.ts` · `app/api/admin/homepage/route.ts` ·
`components/admin/HomepageManager.tsx` ·
`app/admin/preview/homepage/page.tsx` · `tests/homepageConfig.test.mjs` ·
`app/api/admin/activity/[id]/route.ts` · `app/admin/activity/[id]/page.tsx` ·
`components/admin/ActivityDetail.tsx`

**Changed:** `app/page.tsx` (renders from the config) ·
`lib/revalidatePlan.ts` (homepage action) · `lib/adminNav.ts` ·
`app/admin/[section]/page.tsx` · `components/admin/ActivityLog.tsx` ·
`app/globals.css` · `tests/revalidatePlan.test.mjs` ·
`tests/activityFilters.test.mjs`

## To try it

1. Run `supabase/homepage_cms.sql` in Supabase → SQL Editor. Until you do, the
   screen says so and the site keeps rendering the shipped default.
2. `npm run dev` → `/admin/homepage`. Reorder a section, change a heading,
   switch one off. **Check the live homepage — nothing has moved.**
3. **Preview draft**, then **Publish**, then look at the live homepage.
4. Open **History**, load the previous version as a draft, preview, publish.
5. `/admin/activity` → **Open** on the homepage publish entry — before/after
   and whether it can be undone.

---

*Nothing has been deployed. `enableCacheInterception` remains `false`. Existing
Phase 1 R2/OpenNext cache architecture is preserved; a filtered CMS-only D1 tag
invalidation layer was added on 21 Aug 2026 — see docs/CMS-CACHE-LAYER-AUDIT.md.*
