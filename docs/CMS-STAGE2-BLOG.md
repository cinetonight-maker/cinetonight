# CMS Major Update — Stage 2: Blog CMS Core

**Date:** 2026-08-21 · **Scope:** LOCAL ONLY — nothing deployed, nothing pushed
**Status:** code complete, awaiting your verification + one decision (see §7)

Verified locally: `npx tsc --noEmit` clean · `npm test` **42/42 pass** (13 new)
· `npx next build` succeeds · `enableCacheInterception` still **false** ·
no admin JavaScript in any public bundle (checked against the build manifest).

---

## 1. What this stage changed, in plain words

Writing a post used to mean typing into one big box where a blank line made a
new paragraph, and `## ` at the start of a line made a heading. That was all
you could do — no bold, no lists, no links, no images inside the article, no
tables, no video. Delete meant gone forever. There was no history. And if the
browser closed, whatever you had typed was gone.

All of that is fixed:

| Before | Now |
| --- | --- |
| Plain paragraphs + `##` headings only | Full editor: headings, **bold**, *italic*, lists, quotes, links, images, tables, YouTube |
| No preview | Live Preview tab, and a Preview page that reads the real database |
| Delete = gone | Delete = Trash, put it back any time; "Delete forever" is separate |
| No history | Every change to a published post is saved and restorable |
| Close the tab = lost work | Autosaves a draft every 20 seconds |
| Read time typed by hand | Calculated from the article |
| One long list | Filters: All / Published / Scheduled / Drafts / Trash + search |
| Save silently did nothing | Errors appear right next to the Save button |
| No Google preview | Shows how the post will look in search results |

## 2. Safety rules this stage is built on

**Autosave can never publish.** Autosave writes to a separate `draft_body`
column. The live site reads `body`. So the autosave, however often it runs, is
physically unable to change one character of a published article. Publishing is
always a button you press.

**Nothing is destroyed by accident.** Deleting moves a post to Trash: it leaves
the site immediately (status is forced to draft), and it can be put back.
Permanent deletion is a second, explicit action with its own confirmation.

**Every published change is recoverable.** Before a published post is
overwritten, the old version is copied into a history table. Restoring an old
version saves the current one first — so even "undo" is undoable.

**Nothing in a post can break the site.** See §3.

**It still works before you run the database update.** If `blog_cms.sql` has
not been run yet, the new fields are quietly dropped and saving behaves exactly
as it did before, instead of failing. Trash is the one thing that refuses
rather than silently hard-deleting.

## 3. Security: the article renderer

Everything an article becomes on screen now goes through **one** file,
`lib/markdown.ts`, used by the public article page, the static Pages, and the
editor preview — so what you see before publishing is produced by the exact
same code that renders the published page.

Every `<` in the text is escaped **before** the Markdown is parsed. That means
the only HTML that can exist in the output is HTML the Markdown parser itself
built. A `<script>` typed (or pasted) into a post is displayed as text, not
run. Link and image addresses are checked against an allow-list, so
`javascript:` links cannot survive. 13 tests cover exactly these cases.

This also closed a real hole: **static Pages** (About, Privacy, FAQ) previously
passed their content into the page as raw HTML with no filtering at all. The
admin audit flagged it as a genuine XSS surface if the admin login were ever
compromised. It now uses the same safe renderer.

YouTube uses `@youtube(VIDEO_ID)`, which becomes a click-to-load thumbnail, not
an embedded player. An auto-loading YouTube player costs every reader roughly
700 KB and wrecks page-speed scores — the same rule the movie pages already
follow.

## 4. Files

**New**
- `lib/markdown.ts` — the single, safe Markdown → HTML renderer
- `components/admin/MarkdownEditor.tsx` — editor + toolbar + preview + counts
- `components/admin/BlogManager.tsx` — the `/admin/blog` screen
- `components/admin/shared.tsx` — image picker / fetch helper, shared by admin screens
- `app/api/admin/blog/revisions/route.ts` — version history + restore
- `app/admin/preview/blog/[slug]/page.tsx` — uncached true preview
- `supabase/blog_cms.sql` — the database update (run once)
- `scripts/migrate-blog-markdown.mjs` — one-time content migration, with backup
- `tests/markdown.test.mjs` — 13 tests, mostly security

**Changed**
- `app/blog/[slug]/page.tsx` — renders Markdown through the safe renderer
- `app/[slug]/page.tsx` — Pages now sanitized (was raw HTML)
- `app/api/admin/blog/route.ts` — Markdown bodies, alt text, tags, autosave, Trash, revisions
- `app/admin/[section]/page.tsx` — `/admin/blog` now uses the new screen
- `lib/types.ts`, `lib/data.ts` — body may be Markdown or the old array; alt text + tags
- `app/globals.css` — article styles for lists/quotes/tables/images, editor styles

## 5. What you need to do (in order)

1. **Run the database update.** Supabase → SQL Editor → paste
   `supabase/blog_cms.sql` → Run. It only adds columns and one table; it
   changes no existing data and is safe to run twice.
2. **Check the dry run** of the content migration:
   `node scripts/migrate-blog-markdown.mjs`
   It prints every post and whether its text would change. Nothing is written.
3. **Apply it** when the dry run looks right:
   `node scripts/migrate-blog-markdown.mjs --apply`
   It writes a full backup to `backups/` first, and skips any post whose text
   would change. Undo with `--rollback backups/<file>.json`.
4. **Try it locally** at `localhost:3000/admin/blog` — write a post, use the
   toolbar, hit Preview, save a draft, move something to Trash and put it back.

Steps 2 and 3 are optional: old posts render correctly either way, because the
renderer accepts both shapes. The migration just lets you edit them with the
full toolbar.

## 6. Deliberately NOT done in this stage

- No rich-text (Word-style) editor. It would store generated HTML, which makes
  the "escape everything, then parse" security model impossible and breaks on
  pastes from Word. The toolbar gives the same buttons without that cost.
- No image cropping/resizing in the browser — that belongs in Stage 8, Media.
- No related-posts UI yet; tags are stored, and Stage 3 (Internal Linking) uses
  them.

## 7. DECISION NEEDED — "changes appear immediately"

The brief (§13) asks that after publishing, the change shows on the live site
straight away, using surgical revalidation.

**That specific mechanism cannot be built without changing the caching
architecture, which §3 of the brief forbids me to touch.** On Cloudflare,
`revalidatePath()` / `revalidateTag()` only work if OpenNext has a *tag cache*
(a D1 database or a sharded Durable Object) configured. CineTonight
deliberately has none — `lib/supabase/public.ts` says so in writing: *"There is
deliberately NO revalidateTag() path here. On Cloudflare that needs an OpenNext
tag cache (D1 or a sharded Durable Object), which is more infrastructure and
more cost than the problem justifies right now."*

So the honest position is: I can fix the *doubt* today without touching
anything risky, and the *delay itself* needs your decision.

**Done today, no risk:** the editor now confirms the save explicitly, shows the
error when a save is blocked, and adds a **Preview** button that reads the
database directly with no caching — so you can always see the true current
version one second after saving.

**The delay itself.** Today a blog change can take up to ~30 minutes on the
public page: the page is cached for 30 minutes (`revalidate = 1800`) and the
database read behind it for another 30 minutes.

| Option | What happens | Risk | Cost |
| --- | --- | --- | --- |
| **A. Leave it** | Up to ~30 min. Preview covers you meanwhile. | none | none |
| **B. Shorten blog caching** (recommended) | Blog article + list cached ~60s instead of 30 min. Change appears within about a minute. | very low — blog pages are ~10 URLs, so extra cache writes are negligible; touches no shared caching code | none |
| **C. Add the OpenNext tag cache (D1)** | Publish button can clear that exact page instantly. | **this is the change §3 forbids** — it edits `open-next.config.ts`, the same file as the request-loop fix, and needs a fresh deploy + full re-verification | D1 free tier likely enough |

My recommendation is **B**, and only for the blog routes. It gets you 95% of
what §13 asks for while leaving the caching architecture — and today's
known-good loop fix — completely untouched. **C** should wait until we are
ready to do a careful, isolated deploy with the pre-deploy checks re-run.

Tell me which, and I will apply it in Stage 3.

---

*Nothing in this stage has been deployed. `enableCacheInterception` remains
`false`. Existing Phase 1 R2/OpenNext cache architecture is preserved; a
filtered CMS-only D1 tag invalidation layer was added on 21 Aug 2026 —
see docs/CMS-REVALIDATION.md and docs/CMS-CACHE-LAYER-AUDIT.md.*
