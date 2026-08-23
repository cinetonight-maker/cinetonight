# CMS Major Update — Stage 4: Pages Editor

**Date:** 2026-08-21 · **Scope:** LOCAL ONLY — nothing deployed, nothing pushed
**Status:** code complete, awaiting your verification

Verified locally: `npx tsc --noEmit` clean · `npm test` **65/65 pass** ·
`npx next build` succeeds · `enableCacheInterception` still **false** · admin
JavaScript confirmed absent from every public bundle · Phase 1 R2/OpenNext
cache architecture preserved (a filtered CMS-only D1 tag layer was added later,
on 21 Aug — see docs/CMS-REVALIDATION.md).

---

## 1. Why these pages matter more than they look

About, FAQ, Privacy, Contact — these are the pages Google and readers use to
decide whether CineTonight is a real, trustworthy site. They had the weakest
editor on the whole dashboard: one plain box, no preview, no description for
search results, and Delete meant gone forever.

They now use exactly the same editor, preview, Trash and SEO controls as blog
posts.

## 2. What changed

| Before | Now |
| --- | --- |
| Plain textarea | Full editor: headings, bold, lists, links, images, tables |
| No preview | Live Preview tab + a Preview page that reads the real database |
| No search-result control | Meta title + meta description, with a Google preview |
| Delete = gone forever | Trash, with "Put back" |
| Close the tab = lost work | Autosaves a draft every 20 seconds |
| Renaming the address broke links silently | Warns before, and explains what breaks |
| No idea what linked to a page | Each page shows how many links point at it |
| Could create `/blog` or `/admin` and wonder why it never appeared | Reserved addresses are refused with a clear reason |

## 3. The address warning

This is the one genuinely dangerous edit on this screen, so it gets its own
treatment. Changing a **published** page's address from `/about` to `/about-us`
breaks every link pointing at the old one — inside your own posts, in Google's
index, and anywhere it was shared. The screen now:

- shows a yellow warning as soon as you type a different address,
- asks you to confirm, in plain words, before saving,
- and points you at **Internal Links**, which will list exactly what broke.

The API also refuses two addresses that could never work: one already used by
another page, and one that collides with a real section of the site
(`/blog`, `/admin`, `/movies`, `/free-movies`…). Next.js gives real routes
precedence, so a page on one of those addresses would simply never appear —
silently. Now it says so.

## 4. Safety

Same rules as Stage 2, for the same reasons:

- **Autosave writes `draft_content`, never `content`.** The live page reads
  `content`, so an autosave physically cannot change a published page.
- **Trash takes the page off the site immediately** (status forced to draft)
  and is reversible. Permanent deletion is separate and confirms twice.
- **Publishing an empty page is refused.**
- **Works before the database update.** If `pages_cms.sql` has not been run,
  the new fields are dropped from the write and saving behaves exactly as
  before. Trash refuses clearly rather than silently hard-deleting.

One deliberate detail on the public side: the page query now uses `select("*")`
rather than naming columns. Naming `meta_title` before the migration has run
would fail the whole query and 404 every static page. `"*"` is a single fixed
query URL either way, so it costs nothing in cache terms — the rule from
`docs/CACHING.md` about keeping query URLs stable is respected.

## 5. Files

**New**
- `supabase/pages_cms.sql` — the database update (run once)
- `components/admin/PagesManager.tsx` — the `/admin/pages` screen
- `app/admin/preview/page/[slug]/page.tsx` — uncached true preview

**Changed**
- `app/api/admin/pages/route.ts` — SEO fields, autosave, Trash, reserved and duplicate address checks
- `app/[slug]/page.tsx` — uses the meta title/description when set
- `app/admin/[section]/page.tsx` — routes `/admin/pages` to the new screen
- `app/globals.css` — the warning notice style

## 6. What to do

1. Supabase → SQL Editor → paste `supabase/pages_cms.sql` → Run. Adds columns
   only; changes no data; safe to run twice.
2. `npm run dev` → `localhost:3000/admin/pages`. Edit a page, use the toolbar,
   hit Preview, write a meta description and watch the Google preview update.
3. Try renaming a published page's address — you should get the warning, not a
   silent break. (Then don't save it, unless you mean it.)

---

*Nothing in this stage has been deployed. `enableCacheInterception` remains
`false`. Existing Phase 1 R2/OpenNext cache architecture is preserved; a
filtered CMS-only D1 tag invalidation layer was added on 21 Aug 2026 —
see docs/CMS-REVALIDATION.md and docs/CMS-CACHE-LAYER-AUDIT.md.*
