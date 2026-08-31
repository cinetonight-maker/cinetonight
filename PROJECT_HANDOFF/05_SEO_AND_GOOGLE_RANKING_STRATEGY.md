# 05 — SEO and Google ranking strategy

**The single most important document in this pack.** Read it before proposing
any SEO work.

---

## Main SEO goal

Grow organic traffic to **movie pages**. They are the asset. Everything else
supports them.

## THE CORE FINDING — do not reverse this

Search Console, one measured period:

| Source | Clicks | Impressions |
| --- | --- | --- |
| **Total** | ~350 | ~57,000 |
| **Movie pages** | **306** | (majority) |
| Homepage | 9 | 113 |
| Blog | few | meaningful |

Another measurement: movie pages at **50,000+ impressions, 479 clicks**.

**Do not conclude the blog is the main SEO asset.** It is not. This mistake was
explicitly warned against by the owner.

### Movie pages that were ranking

| Query | Clicks | Impressions |
| --- | --- | --- |
| hallam foe | 34 | 2,783 |
| the skin i live in | 12 | 775 |
| hallam foe movie | 9 | 124 |
| repeated love 2026 | 5 | 328 |
| repeated love | 5 | 121 |
| nando between two worlds | 4 | 6,557 |
| nando film | 3 | 798 |

Average positions: Hallam Foe ~6.4, The Skin I Live In ~7.5, Repeated Love ~8,
Nando Between Two Worlds ~4.4.

**Measurement caution, learned the hard way.** GSC average position and manual
SERP checks disagree badly on this site. Nando showed ~4.4 in GSC but appeared
around page 3 manually. Hallam Foe showed 34 clicks in GSC but was not visible
across ~16 pages of manual searching. **Treat Search Console as the primary
source. A single manual SERP check proves nothing.**

## Current SEO stage

Roughly two weeks after launch, following a traffic collapse. Diagnosis
complete, no technical cause found. See `09_CURRENT_PROBLEMS_AND_FIXES.md`.

Independent audit scores (26 Aug, `docs/seo-audit-cinetonight-com-2026-08-26.pdf`):
**SEO 5/10, GEO 4/10, AEO 6/10.** The SEO score is understated — several
findings turned out to be stale-cache artefacts, not real defects. Corrected
estimate is around **7/10**. The audit PDF is **partially wrong** and should be
read alongside section 7 of `docs/PROJECT-STATE-2026-08-26.md`.

## Indexing and discovery strategy

~24,000 pages indexed, overwhelmingly movie pages.

**The sitemap deliberately does NOT list the long tail.** It carries 463 URLs,
of which 180 are movie pages. Hallam Foe — the best performer — is not in it.
It was discovered by Googlebot **following an internal link** from another
movie page, then crawled and indexed without complaint.

**This was reviewed on 26 August and deliberately left as is.** The owner's
reasoning, preserved:

> TMDB has millions of movies. We don't have to add all of those to our
> sitemap. Focus the sitemap on our other pages, and let Google handle the
> movie pages on its own, as it already found 24k.

A sitemap should list what you own and curate. Expanding it to 24,000
TMDB-derived pages would spend crawl budget and Cloudflare money on pages
nobody chose. **Do not re-propose sitemap expansion without new evidence.**

**Proven:** indexing works. Discovery is the constraint, and internal links are
doing that job.

## Internal linking strategy

Blog → movie pages. This is the stated architecture:

> Blog → Movie pages → Streaming/provider pages

**Current reality:** mostly not happening. `docs/BLOG-AUDIT.md` finding I4:
posts #3 through #10 have **zero** in-body links. The weekend post names ten
films and links two. Only `best-anime-for-beginners` does it properly, linking
to real verified movie URLs.

**Hard rule:** never invent an internal URL or a movie ID. A guessed TMDB id is
either a 404 or a link to the wrong film. Verify every path against the live
sitemap or by fetching it. This rule is in `docs/CONTENT-RULES.md` and it is
not negotiable.

Known-good destinations: `/`, `/movies`, `/tv-shows`, `/web-series`,
`/trending`, `/latest`, `/genres`, `/discover`, `/free-movies`, `/blog`,
`/channel/*` (15), and `/movies?genre=` for Action, Adventure, Drama, Mystery,
Sci-Fi only. Homepage anchors that work: `/#tonights-pick`, `/#choose-your-mood`.

## Googlebot considerations

- robots.txt allows Googlebot everywhere except `/admin`, `/api/`, `/account`,
  `/my-list`, `/signin`, `/signup`, `/_next/image`, `/search`
- **Verified 26 Aug via GSC URL Inspection:** page indexed, crawl allowed,
  fetch successful, indexing allowed, and **Google-selected canonical =
  Inspected URL**, i.e. Google agrees with ours
- No Googlebot blocks in Cloudflare — every blocked IP in the event log was AWS
- `/api/watch` being robots-disallowed means **Where to Watch is invisible to
  Google** on ~24,000 pages. Fix is written but not deployed.

## AI crawler considerations (GEO)

Deliberately welcoming: GPTBot, ClaudeBot, anthropic-ai, OAI-SearchBot,
ChatGPT-User, PerplexityBot, CCBot, Meta-ExternalAgent, Amazonbot — all allowed
on content, excluded only from `/person/` and `/_next/image`.

**A serious self-inflicted wound was found and fixed on 26 August.** Cloudflare
Rule 3 also blocked those crawlers from `/movie/tmdb-*` — the entire long tail —
while robots.txt explicitly allowed them. 69,410 blocks. The comment in
`app/robots.ts:32` claimed "a matching edge rule enforces this"; it did not
match. `/movie/tmdb-` was removed from the rule. Rule 4, which blanket-blocked
ClaudeBot, was deleted.

GEO weaknesses: no external brand footprint (a brand search returns competitors
CineVibe, CineNightly, Cineo, The Movies Finder — not CineTonight), and until
the pending deploy, no named authors.

## Blocked pages, and the pages worth building

Pages that will **never** rank and should not be optimised for traffic: About,
Contact, Privacy, Terms. They matter for trust and entity understanding only.

What actually builds authority is **off-site mentions**, not on-site pages.
Suggested and not yet done: directory listings where competitors already
appear (AlternativeTo and similar), and genuine participation in film
communities.

**Author pages** were built for this reason: `/author/shahzaib-ali` and
`/author/syed-ahmad`, each with `Person` schema. Pending deploy.

## Current SEO priorities

1. Ship the pending batch — especially Where to Watch in the HTML
2. Set the edge purge secrets, then purge the launch-day pages
3. Add in-body links from articles to real, verified movie pages
4. Build off-site brand presence

## Experiments and observations

- Long-tail title pattern `"Title (Year) — Cast, Trailer & Where to Watch"`
  targets real spoken/typed phrasing rather than the bare film name, which
  would compete with IMDb and Wikipedia. Appears to work.
- Person pages were 46% of the indexed sample and were deliberately noindexed.
  **Expect indexed count to fall. That is the plan working. Do not reverse it.**

## UNKNOWN — requested but never established

These were asked for in the handoff brief but appear **nowhere** in the session
or the project files. **Do not present them as project strategy.**

- **Semrush usage.** Never discussed. "Semrush" appears only as `SemrushBot` in
  the robots.txt blocklist. The tool actually mentioned was **Ahrefs**, and only
  as "connected, don't make decisions from it yet".
- **Keyword research approach / low KD opportunities** — no method established
- **Topic clusters, pillar pages, topical authority strategy** — zero mentions
- **"Best Movies Like Inception"** — never discussed in any form
- **"Best Movies Under 90 Minutes" as a discovery/SEO page** — never discussed.
  **However**, "Under 90 Minutes" **does exist as a live Quick Pick filter** in
  `lib/quickPicks.ts` and `lib/discoveryConfig.ts`. Do not confuse the existing
  filter with a planned SEO page. If such pages are wanted, that is a **new**
  decision to be made, not a previous one to be recovered.
- GSC country breakdown — never checked, despite being the deciding input for
  the India-vs-US question
