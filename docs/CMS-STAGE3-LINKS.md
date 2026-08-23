# CMS Major Update — Stage 3: Internal Linking

**Date:** 2026-08-21 · **Scope:** LOCAL ONLY — nothing deployed, nothing pushed
**Status:** code complete, awaiting your verification

Verified locally: `npx tsc --noEmit` clean · `npm test` **65/65 pass** (23 new)
· `npx next build` succeeds · `enableCacheInterception` still **false** ·
admin JavaScript confirmed absent from every public bundle · Phase 1 R2/OpenNext
cache architecture preserved (a filtered CMS-only D1 tag layer was added later,
on 21 Aug — see docs/CMS-REVALIDATION.md).

---

## 1. Why this stage matters

Internal links — links from one CineTonight page to another — are the cheapest
SEO work available. They tell Google how the site fits together, and they keep
a reader who finished one article moving to the next instead of leaving.

CineTonight had almost none, and nothing could see the problem, because nothing
in the dashboard ever looked inside the article text. This stage adds both
halves: the site now links itself together automatically, and you can now *see*
where the linking is broken or missing.

## 2. What's new — for readers

**"Read next" under every article.** Three related posts, chosen by shared
tags first, then shared category, then shared words in the title. If nothing is
strongly related it falls back to the newest posts, so the block is never empty
and never a wasted slot.

This costs **zero extra database work**. The article page already loads the post
list (it uses it to check the slug is real), and React caches it for the render,
so "Read next" reuses data that was already in memory. No new cache entries, no
new queries, nothing added to the R2 bill.

## 3. What's new — for you, in the dashboard

### `/admin/links` — Internal Links

A new screen that reads every article and page in the database and answers
three questions nothing could answer before:

**Broken links.** Links pointing at pages that do not exist — almost always a
post that was renamed or moved to Trash. A reader clicking one lands on a "not
found" page, and Google counts it against the site. Each one is shown with the
post it's in and a Fix button.

**Nothing links to these.** Live pages that no other page points to. Google
reaches them only through the sitemap, so they rank slower than they should.

**Dead ends.** Live pages with fewer than two links out to the rest of the
site. A reader who finishes one of these has nowhere to go, so they leave. Two
is the working minimum: one deeper into the site, one back to a hub.

**Not checked.** Links to actor pages, channels and TMDB-only titles. Those
pages are built on demand from TMDB, so there is no list to check them against.
They are listed separately rather than guessed at — calling a working link
broken would be worse than saying nothing.

**Most linked-to pages.** Where your own links point most often, i.e. the pages
you are telling Google matter most. Worth checking those are the ones you
actually want ranking.

### In the article editor

- **Internal link** now searches the *whole* site — every published post, page,
  movie, series, free movie and section — not just posts and pages. Type to
  filter, click to insert.
- **"You mention these — link them?"** appears under the editor when the text
  names a page you have not linked to. One click adds the link. This is the
  work the Internal Links screen would otherwise ask you to come back and do.
- The footer now counts links to other CineTonight pages and warns below two,
  so a dead end is caught while you're writing rather than found weeks later.
- The editor never suggests linking a post to itself.

## 4. Rules the checker follows

These are all covered by tests, because a link checker that cries wolf gets
ignored:

- `/blog/x`, `/blog/x/`, `https://cinetonight.com/blog/x` and
  `.../blog/x/?utm=1#top` are recognised as **one** page.
- Images are never counted as links. A linked image (which is what every
  `@youtube()` block becomes) counts once — as the link, not the picture.
- A page linking to *itself* does not count toward its own link total.
- Drafts and trashed posts are never reported as orphans (they aren't
  published, so nothing should link to them), and are never offered as link
  targets — linking to one would create a 404.
- A scheduled post counts as live once its time has passed, matching exactly
  what the public site does.
- External links are counted but never reported as a problem.

## 5. Files

**New**
- `lib/linkGraph.ts` — link extraction, checking, related posts, suggestions (pure, testable)
- `tests/linkGraph.test.mjs` — 23 tests
- `app/api/admin/links/route.ts` — builds the report and the link inventory
- `components/admin/LinksManager.tsx` — the `/admin/links` screen

**Changed**
- `app/blog/[slug]/page.tsx` — "Read next" block
- `components/admin/MarkdownEditor.tsx` — searchable site-wide link picker, suggestions, link counter
- `components/admin/BlogManager.tsx` — feeds the editor the full link inventory
- `app/admin/[section]/page.tsx` — routes rebuilt screens by slug
- `lib/adminNav.ts` — "Internal Links" added under Content
- `app/globals.css` — Read-next cards, suggestion strip, status colours

## 6. Three bugs the tests caught before you saw them

Worth recording, because all three would have produced *wrong* reports rather
than obvious breakage:

1. A linked image (`[![thumb](pic.jpg)](page)`) was being read as a link to
   `pic.jpg` instead of to `page`. Every YouTube block in every article would
   have been mis-reported. Fixed by removing image syntax before scanning.
2. `/search` was being flagged as unverifiable when it is a perfectly real
   route.
3. My first related-posts test asserted the wrong winner — the scoring was
   right and the test was wrong. Corrected rather than bending the code to fit
   a bad test.

## 7. What to check locally

1. `npm run dev` → `localhost:3000/admin/links`. It reads your real content, so
   expect it to find genuine problems — that is the point.
2. Open any blog post on the site and look for **Read next** under the article.
3. In the editor, click **Internal link** and search for a movie by name; then
   type a movie's name into the article body and watch the suggestion strip
   appear underneath.

## 8. Deliberately not done

- No automatic link injection into article text. A tool that edits your writing
  without asking is how content gets quietly mangled; suggestions you click are
  the right trade.
- No external (outbound) link checking. That means calling other people's
  servers on a schedule, which is a different kind of job and a different cost.
- Broken-link count is not yet on the Overview screen — that belongs with
  Stage 9 (Overview + Scheduling) so the Overview API gets one coherent pass.

---

*Nothing in this stage has been deployed. `enableCacheInterception` remains
`false`. Existing Phase 1 R2/OpenNext cache architecture is preserved; a
filtered CMS-only D1 tag invalidation layer was added on 21 Aug 2026 —
see docs/CMS-REVALIDATION.md and docs/CMS-CACHE-LAYER-AUDIT.md.*
