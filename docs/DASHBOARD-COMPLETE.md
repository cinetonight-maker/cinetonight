# CineTonight Dashboard — Complete

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed**

`tsc` clean · `npm test` **179 / 179** · `next build` OK ·
`opennextjs-cloudflare build` OK · predeploy gate **4/4** ·
`enableCacheInterception` still `false` · no admin JS in any public bundle ·
**every public route's revalidate tier identical to before this work.**

You asked for the dashboard finished in one push, then SEO. This is that push.

---

## Every sidebar row now does something

There are **no "Soon" rows left**.

| Section | State |
| --- | --- |
| Overview | Real figures, real activity, real sparklines |
| Homepage | Hero copy + artwork, section order, on/off, headings, counts |
| Blog Posts | Full editor, scheduling, autosave, revisions, trash, internal links |
| Pages | Same, plus SEO fields and the address-rename warning |
| Internal Links | Broken links, orphans, dead ends |
| Movies & Series | Existing catalogue screen |
| Free Movies | Existing screen |
| **Discovery** | Moods, Quick Picks, Explore tabs, **Streaming Services**, Tonight's Pick rules |
| **Media Library** | **Storage used, unused-file detection, safe bulk delete** |
| Navigation | Existing footer/social links screen |
| Sync Center | Existing |
| Comments | Existing, now with a delete confirmation |
| Activity Log | Filter by module, action, admin, date, search; per-entry detail |
| **System Health** | **Setup checklist, services, storage, broken content** |
| **Settings** | **Draft → publish → rollback, with warnings and a Google preview** |

Bold = new in this push.

---

## What is new, and the thinking behind each

### Streaming Services — folded into Discovery, not a new screen

They are a discovery surface, so they live with the other discovery surfaces:
one screen, one publish, one history. Reorder them, switch them off; the
homepage shows the first eight that are on, and the screen tells you which
those are. The slug is part of `/channel/<slug>`, so it is not editable — same
rule as mood ids.

### Hero copy — the H1 is now yours

The site's main headline and the paragraph under it are editable. The last two
words stay highlighted in purple, split automatically, so a rewritten headline
keeps the same emphasis. A blank value falls back to the shipped wording — the
site's most SEO-significant line can never render empty.

**One bug caught here:** picking a hero poster used to rebuild the hero object
from scratch, which silently reset an edited headline back to the default. Fixed
and regression-tested.

### System Health — the setup checklist is the useful part

It probes your database and tells you **which of the six SQL files you have
actually run**, and what each one unlocks. It also says plainly whether
publishing is instant yet, and what to set if you want it to be.

Services, media storage, and content that would look wrong to a visitor
(published posts with no image, published pages with no content) are all
measured.

**R2 usage and request counts are deliberately absent.** They live in the
Cloudflare dashboard, and reading them would mean storing a Cloudflare API
token in the site purely to draw a number. The screen says where to look
instead. That was your instruction and it is still the right call.

### Media Library — the R2 cost control

Every uploaded image, how much space it uses, and **which files nothing points
at**. "Unused" is decided by scanning every place an image URL can end up:
featured images, images inside article bodies, page content, catalogue posters
and backdrops, free-movie artwork, and the homepage and discovery configs.

Matching is on the **file name**, not the whole URL, because the same file can
be referenced through slightly different addresses. Matching the full string
would report a file as unused while a page is still showing it — and this
report exists to help you delete things, so a false "unused" is the one wrong
answer that destroys something.

Bulk delete counts how many of the selected files are still in use and says so
before it does anything. Every deletion is logged.

### Settings — a draft, because it is on every page

The old screen changed the whole site the moment you pressed Save. It now has
the same contract as everything else: draft, publish, rollback, audit, plus a
Google preview and warnings for a too-short title or a malformed email.

A social link is only used if it is a full `https://` address — anything else
is dropped rather than rendered, so a mistyped value can never become a broken
or unsafe link in the footer. Maintenance mode confirms loudly, twice.

Publishing settings clears the **data tag only** and rebuilds **no routes**.
The title and description are in the root layout, so revalidating "everything
affected" would mean hundreds of R2 writes for a text change. Pages pick the
new values up on their own next rebuild, and the screen says so rather than
implying it is instant.

---

## Cache and performance — the part that protects the live site

| Publish | Tags | Routes rebuilt |
| --- | --- | --- |
| Blog post | `cms:blog`, `cms:blog:<slug>` | ≤ 3 |
| Page | `cms:pages`, `cms:page:<slug>` | 0 (force-dynamic) |
| Homepage | `cms:homepage` | 1 |
| Discovery | `cms:discovery` | 2 |
| Settings | `cms:settings` | **0** |

No plan can name a movie, person, genre or browse route — asserted by a test
across all five.

**Public route tiers, verified in the build output after every change:**
`/` 15m · `/discover` 1d · `/free-movies` 1d · `/faq` 1d — all exactly as
before this work started.

That check exists because Stage 6 nearly broke it: a config read on the
30-minute tier dragged `/discover` from a 1-day ceiling to 30 minutes — 48×
more R2 writes on that route. Next takes the *minimum* of a route's revalidate
and every fetch inside it. Both config reads are on the 24-hour tier now, and
the tag is what makes a publish appear immediately.

---

## Still to do — and it is all SEO, as you wanted

1. **Redirects** — old URL → new URL. This is the real gap: renaming a page
   slug already breaks every link to it, Internal Links reports the damage, and
   there is no way to fix it without code.
2. **Global SEO controls** — noindex rules, canonical settings, sitemap
   behaviour.
3. **Blog SEO fields** — focus keyword, OG image, canonical override.
4. **Catalogue+** — bulk actions and better search. Convenience, not need.
5. **Full regression audit**, then the first deploy.

---

## Before any of it works: six SQL files

Supabase → SQL Editor, paste, Run. Each adds columns and tables only, changes
no existing data, and is safe to run twice. **System Health tells you which are
still outstanding**, so you never have to remember.

```
supabase/blog_cms.sql        Trash, history, autosave recovery, tags, alt text
supabase/pages_cms.sql       Trash, history, page SEO
supabase/audit_log.sql       The activity log
supabase/homepage_cms.sql    Homepage Manager
supabase/discovery_cms.sql   Discovery Manager
supabase/settings_cms.sql    Settings history
```

Everything keeps working without them — the dashboard hides the feature and
says why. Nothing on the live site is affected either way.

---

*Nothing has been deployed. `enableCacheInterception` remains `false`. Existing
Phase 1 R2/OpenNext cache architecture is preserved; a filtered CMS-only D1 tag
invalidation layer was added — see docs/CMS-CACHE-LAYER-AUDIT.md.*
