# 06 — Content and editorial strategy

**`docs/CONTENT-RULES.md` is authoritative.** This file summarises and adds
context; where they differ, CONTENT-RULES wins.

## The five rules that will bite you

1. **Never put an H1 in a body.** The template renders the title as the `<h1>`.
   A `# Title` line produces a second one and the heading appears **visibly
   twice**. Four live posts shipped this way. Bodies start at `##`.
   `scripts/import-page.mjs` now refuses an H1 outright.
2. **A database write does not update the live page.** After
   `node scripts/import-post.mjs <slug>`, open the post in `/admin` and press
   **Publish**. That is the only action that fires the cache purge.
3. **`meta_title` is limited to 46 characters**, because the site appends
   `" — CineTonight"` (14 chars) to reach the 60-char limit.
4. **Never write an unverified internal link.** Check every path against the
   live sitemap. Do not guess movie URLs.
5. **Raw HTML does not render.** `lib/markdown.ts` escapes every `<` by design.
   Markdown tables do work and are styled.

## House style

No em dashes, no en dashes. Straight apostrophes. British-leaning spelling.
Label certainty as **Confirmed** (studio/platform announced), **Reported**
(trade press), or explicitly as inference. **Make no maintenance promises**
unless someone will actually keep them.

## Publish checklist

18 checks in the blog editor. Target **18/0/0**. Three were added on 23 August
because things got through: *Article sections*, *Meta description ends cleanly*,
*No competing post*.

A warning is not always wrong. "Focus keyword in the URL" warns on any live post
whose slug predates its keyword, and the right response is usually to ignore it.
Renaming a live URL is worse.

## Workflow

```
node scripts/export-posts.mjs          # dump every post to content/posts/
# edit the markdown
node scripts/import-post.mjs <slug>    # write it back
# then press Publish in /admin
```

For CMS pages (added 26 Aug):
```
node scripts/import-page.mjs <slug> --dry
node scripts/import-page.mjs <slug>
node scripts/fix-page-h1.mjs --all --dry    # find duplicate-H1 bodies
```

**Trap:** `content/posts/*.md` are **stale exports**. Their `status:` field can
say `draft` while the post is live and published. Two posts were wrongly
believed unpublished for exactly this reason. **Always check the live URL.**

## Article structure that works

The two strongest recent posts, as models:
- `what-to-watch-on-netflix` — 2,200 words, 50 H3 picks, verified internal
  links, evergreen URL with **no month in the slug** so it can be refreshed
  rather than replaced
- `best-anime-for-beginners` — 1,400 words, opens with a comparison table
  mapping viewer taste to a recommendation, links to real movie URLs

Both use question-shaped headings, which is what answer engines extract from.

## Existing posts (12 live)

| Slug | Status |
| --- | --- |
| what-to-watch-on-netflix | Strong, 2,200w, evergreen |
| best-anime-for-beginners | Strong, 1,400w, real movie links |
| cant-decide-what-to-watch-tonight | Good, ~1,990w, 16 links |
| dune-3-release-date-cast-plot-trailer | Good, ~2,100w, **0 in-body links** |
| best-date-night-movies | Good, ~2,100w, poorly linked |
| what-to-watch-this-weekend-august-21-23-2026 | **Expired** — dated slug, window passed |
| what-to-watch-before-avengers-doomsday | Was structurally broken; rebuilt 23 Aug |
| avengers-doomsday-release-date-india | Was thin; rebuilt 23 Aug |
| spider-man-brand-new-day-ott-release-date | Was thin; rebuilt 23 Aug |
| michael-ott-release-date-jiohotstar | **Still thin** (~272w originally) |
| jana-nayagan-ott-release-date | **Still thin** (~307w originally) |
| cocktail-2-ott-release-date | Rebuilt — 223w → ~950w, 5 H2s, FAQ |

`what-should-i-watch-tonight-how-to-decide-in-5-minutes` was retired as a
duplicate and 308s to `cant-decide-what-to-watch-tonight`.

## The OTT release-date problem

Three thin posts at different lifecycle stages:
- michael-ott-release-date-jiohotstar — JioHotstar, 29 Aug 2026
- jana-nayagan-ott-release-date — ZEE5, date not announced
- cocktail-2-ott-release-date — Netflix, streaming since 14 Aug 2026

One thin page per film creates a traffic spike then a dead page. A long-term
**"New OTT Releases in India"** hub was proposed. **It was a plan, not a
decision.** The three posts have clicks and were NOT to be redirected
automatically. A weekly update commitment is required first — and per house
style, do not promise freshness nobody will deliver.

**The owner never answered whether anyone will maintain these weekly.** Still open.

## Content direction

Publish useful evergreen content. No thin generic posts. Use real search intent.
Permanent URLs. Prefer content that can be updated over content that expires.
**Do not copy competitor articles** — a competitor piece on anime for beginners
was shared as inspiration with an explicit instruction not to copy it.

## Feature images

Required for the checklist. Mixed hosting today: some Supabase Storage, some
hotlinked TMDB. Worth standardising. One post used the wrong image entirely.

## Social content

The site also publishes social clips and posts. Separate from the SEO/content
architecture. **Details UNKNOWN** — never covered in this session.
