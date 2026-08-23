# CineTonight — SEO Architecture Audit (Phase 4, pre-implementation)

**Date:** 21 August 2026 · **AUDIT ONLY — no code changed, no tables added, no dashboard built.**

Everything below comes from reading the actual files in this repository, not from
assumption. Where I could not verify something from code alone it is marked
**UNVERIFIED** and listed in the open questions at the end.

Files inspected: `app/sitemap.ts`, `app/robots.ts`, `next.config.mjs`,
`middleware.ts`, `app/layout.tsx`, and every `page.tsx` under `app/`, plus
`lib/site.ts`, `lib/tmdb.ts`, `lib/browse.ts`, `lib/data.ts`, `lib/channels.ts`,
`components/ListingPage.tsx`, `components/MovieDetail.tsx`.

---

## 0. The headline finding

Your Search Console sample says **53% `/movie/tmdb-*` + 46% `/person/tmdb-*` ≈ 99%
of the index**. That leaves roughly **1% for everything that actually makes
CineTonight a site rather than a TMDB mirror** — the blog, the channel pages, the
free-movies library, the FAQ, the custom pages.

That split is not an accident. It is the exact shape the code produces:

- `/movie/[id]` and `/person/[id]` are the only two routes whose URL space is
  **unbounded** (any TMDB id renders a real 200 page).
- Every movie page links **10 cast members**. Every person page links **up to 20
  credits**. Each credit is a movie page, which links 10 more people. This is a
  self-expanding graph with no exit — the same graph that produced the
  **2.79M R2 objects / 211 GB / ~1M writes a day** incident documented in
  `app/person/[id]/page.tsx`.
- The rest of the site is a **closed set** — 15 channels, 18 curated titles, a
  handful of blog posts and pages. It cannot out-produce an infinite graph.

The R2 cost was fixed (person pages are `force-dynamic`, so they write nothing).
**The crawl and indexation problem was not.** Google is still spending nearly all
of its budget on those two patterns, and person pages are the worse half.

### Why person pages are the priority

`app/person/[id]/page.tsx`, verified line by line:

| Check | Finding |
| --- | --- |
| Canonical tag | **None.** No `alternates` in `generateMetadata` at all. |
| Robots directive | **None** — only the not-found case is noindex. Fully indexable. |
| Slug tolerance | `parsePersonTmdbId` = `/^tmdb-p-(\d+)(?:-[a-z0-9-]*)?$/` — **any trailing slug resolves**. |
| Redirect to one URL | **Absent.** `/movie/[id]` has `permanentRedirect` for exactly this; `/person/[id]` does not. |
| Second URL for the same person | Yes — `/person/shah-rukh-khan` (name id, what the **sitemap** emits) and `/person/tmdb-p-35742-shah-rukh-khan` (tmdb id, what **every internal link** emits) are both live pages for one person. |
| Content | Name, photo, a generated sentence, a credits grid. Hardcoded `<b>India</b> Based in` for every person on earth. |
| Blocked for | AI crawlers only (`ClaudeBot`, `GPTBot`, `PerplexityBot`, …). **Googlebot is fully allowed.** |

So one actor is reachable at an **unlimited** number of indexable, canonical-free,
near-identical URLs, and the sitemap and the internal links point at two
*different* ones. That is the 46%.

`/movie/[id]` has none of these problems: it canonicalises, and line 108
`permanentRedirect` collapses slug variants to one URL. Its 53% is mostly
legitimate — it is the money page. It is not the thing to cut.

---

## 1. SEO Route Decision Matrix

Legend for **Action**: `INDEX` · `NOINDEX, FOLLOW` · `REDIRECT` ·
`REMOVE FROM SITEMAP` · `KEEP INTERNAL ONLY` · `REVIEW`

### 1.1 The money pages — keep and protect

| Route | Purpose | SEO value | Index? | Duplicate / unlimited risk | In sitemap? | Internal links in | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Homepage | Highest | Yes | None | Yes, priority 1 | Everything | **INDEX** |
| `/movie/[id]` — curated (18) | Title detail | Highest | Yes | None — one id each | Yes, all 18 | Homepage rows, rails, listings, sitemap | **INDEX** |
| `/movie/tmdb-m-*` / `tmdb-t-*` | Title detail, live TMDB | High — 53% of index, and the long-tail intent titles ("Cast, Trailer & Where to Watch") are well built | Yes | **Bounded by redirect.** Slug variants 308 to the canonical id (line 108). URL space is still infinite, but each URL resolves to exactly one canonical. | Yes, **capped at 150** | Every rail, every related row, homepage | **INDEX** (keep the 150 cap) |
| `/blog/[slug]` | Original articles | **Highest strategic value** — the only content nobody else has | Yes | None | Yes, with real `lastModified` | `/blog`, BlogSection, RightRail, `/links` | **INDEX** — needs more of it |
| `/free-movies` + `/free-movies/[slug]` | Legal public-domain films | High — "watch free legally" is a thin, winnable SERP | Yes | None (closed list) | Yes | Footer, homepage, `/discover`, `/links` | **INDEX** |
| `/channel/[slug]` (15) | "What's on Netflix/JioHotstar" | High, India-first intent | Yes | Closed set; unknown slug `notFound()` in `generateMetadata` = real 404 | Yes, all 15 | Homepage StreamingRow, `/discover` | **INDEX** |
| `/faq` | Answers + `FAQPage` JSON-LD | Medium-high (PAA / AI citations) | Yes | None | Yes | Footer | **INDEX** |
| `/[slug]` (About, Privacy, …) | Custom pages | Low but necessary (E-E-A-T, trust) | Yes | Catch-all, but membership is checked against one cached slug list before any query | Yes, published only | Footer | **INDEX** |

### 1.2 The browse layer — index the hub, tame the variants

| Route | Purpose | SEO value | Index? | Duplicate / unlimited risk | In sitemap? | Internal links in | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/movies`, `/tv-shows`, `/web-series`, `/trending`, `/latest` | Browse hubs | Medium — real head terms | Yes | Self-canonical, `force-dynamic`, CDN-cached 1h. Safe. | `/movies`, `/tv-shows`, `/web-series`, `/trending`, `/latest` all listed | Header, Footer, `/discover`, `/genres` | **INDEX** |
| `…?genre=<known>` | Genre landing | Medium — "action movies" style terms | Yes | Self-canonicalises to itself (`lib/site.ts:68`) — intended | **Only `/movies?genre=` is listed** (~15–18 URLs). The other four hubs' genre variants are not. | `/genres` grid, `GenresWidget` | **INDEX** — but see risk R3 |
| `…?genre=<junk>` | — | **Negative** | **No** | **Real risk.** `genreIdFor()` returns `undefined` for an unknown name → the page renders **unfiltered content** but with a **unique self-canonical** `?genre=<junk>` and a `<junk> Movies — …` title. Unlimited indexable duplicates of the hub. | No | None | **REVIEW → NOINDEX or 404 on unknown genre** |
| `…?page=`, `…?sort=` | Pagination / sort | None | No | Low — `generateMetadata` ignores them, so canonical collapses to the hub; `getBrowsePage` clamps `page ≤ MAX_BROWSE_PAGE` server-side | No | Client-side only, not in HTML | **KEEP INTERNAL ONLY** (already correct) |
| `/genres` | Genre index | Medium | Yes | None | Yes | Footer, RightRail | **INDEX** |
| `/discover` | Discovery hub | Medium — canonical, ISR 1d, cheap | Yes | None (static tiles) | **NO — missing** | Homepage | **INDEX + ADD TO SITEMAP** |

### 1.3 The problem pattern

| Route | Purpose | SEO value | Index? | Duplicate / unlimited risk | In sitemap? | Internal links in | Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/person/[id]` — name form | Filmography | **Low** — thin, auto-generated | **No** | Duplicate of the tmdb form | **Yes — 50 URLs** | None (nothing links these) | **NOINDEX, FOLLOW + REMOVE FROM SITEMAP** |
| `/person/tmdb-p-*` | Filmography | **Low** — 46% of index, near-zero differentiation vs IMDb/Wikipedia | **No** | **Highest on the site.** No canonical, no redirect, unlimited slug variants, unlimited ids, self-expanding link graph | No (link-discovered only) | **10 per movie page**, sitewide | **NOINDEX, FOLLOW** |

`NOINDEX, **FOLLOW**` is deliberate, not a compromise. `follow` keeps link equity
flowing from a person page **through** to the movie pages in their credits grid —
those are the pages you want ranked. `noindex` stops the pages themselves eating
the index. Do **not** add these to `robots.txt` Disallow: a disallowed page can
never be crawled, so Google never sees the `noindex`, and the URLs sit in the
index as bare links forever. Crawl first, noindex second, then Disallow later
once they have dropped out — if at all.

### 1.4 Already handled correctly

| Route | Current state | Verdict |
| --- | --- | --- |
| `/admin/*` | `robots.txt` Disallow + `robots:{index:false,follow:false,noimageindex:true}` in `app/admin/layout.tsx` + `X-Robots-Tag: noindex, nofollow, noarchive` HTTP header (`next.config.mjs:169`). All three mechanisms Google documents. | **KEEP INTERNAL ONLY — correct, no change** |
| `/api/*` | `robots.txt` Disallow `/api/` | **KEEP INTERNAL ONLY — correct** |
| `/admin/preview/*` | Every preview route carries `robots:{index:false,follow:false}` and sits under the `/admin` disallow and header | **Correct — this is what makes draft-preview SEO-safe** |
| `/p/[slug]` | 308 via `next.config.mjs:28` (real HTTP redirect, emitted before rendering) | **REDIRECT — correct** |
| `/pricing` | 308 to `/` via `next.config.mjs:30` | **REDIRECT — correct** |
| `/links` | `robots:{index:false,follow:true}`, not in sitemap | **NOINDEX, FOLLOW — correct** |
| `/account` | `robots:{index:false,follow:true}` + Disallow | **Correct** |

### 1.5 Needs a decision

| Route | Purpose | Index? | Issue | Action |
| --- | --- | --- | --- | --- |
| `/search` | Internal search | No | **Contradiction.** Disallowed in `robots.txt` **and** `robots:{index:false,follow:true}` — Google cannot crawl it, so it never reads the noindex. Meanwhile `app/layout.tsx:111` publishes a `SearchAction` sitelinks-searchbox pointing at `/search?q={search_term_string}`, and `/links` links to `/search` in crawlable HTML. You are advertising a URL template you have forbidden. | **REVIEW** — pick one mechanism. Recommended: keep the Disallow (it protects an unbounded `?q=` SSR space), and **remove the `SearchAction` JSON-LD**, since it points at a path you have blocked — and Google retired the sitelinks-searchbox feature it was added for. **UNVERIFIED:** whether `/search` currently appears in the index as a bare URL. |
| `/signin`, `/signup` | Auth | No | Disallowed in `robots.txt` but carry **no `robots` meta**. The Footer links `/signin` in crawlable HTML → classic "Indexed, though blocked by robots.txt". | **NOINDEX, FOLLOW** (add the meta), keep the Disallow |
| `/my-list` | Watchlist | No | Disallowed, `force-dynamic`, **no `robots` meta**, and the Header links it sitewide (`components/Header.tsx:87`) | **NOINDEX, FOLLOW** (add the meta) |
| `/follow` | Socials | Yes | In sitemap, has canonical. Thin but legitimate. | **INDEX** — low priority |
| `/rss.xml` | Feed | n/a | Correct: force-dynamic, edge-cached 1h | **No change** |
| `/blog/[slug]`, `/free-movies/[slug]` with an unknown slug | — | No | Both are **ISR** (`revalidate` 1800 / 86400) with `dynamicParams` on. An invented slug renders `notFound()`. **UNVERIFIED:** whether that 404 gets persisted as an R2 object per junk slug in the deployed Worker. If it does, it is a smaller replay of the person-page incident. | **REVIEW — test before Phase 4 code** |
| `/movie/[id]` and `/person/[id]` not-found responses | — | No | Both files document a **soft 404**: `notFound()` renders the 404 view but the response carries **HTTP 200**. The `noindex` meta is the only thing stopping crawlers keeping invented ids. **UNVERIFIED in production** — both comments say to check the deployed Worker. | **REVIEW — verify against the live site** |

---

## 2. Indexation Risk Report

Ranked by how much damage each does today.

**R1 — Person pages are half the index and should be none of it. `CRITICAL`**
Unlimited ids × unlimited slug variants × no canonical × no redirect × 10 links
from every movie page. Thin, auto-generated, and competing with IMDb on IMDb's
own turf. Every crawl of a person page is budget not spent on a blog post.
*Fix:* `noindex, follow` on the route, drop the 50 name-form URLs from the
sitemap, and add the same `permanentRedirect` slug-canonicalisation `/movie/[id]`
already has. No database, no config, no cache change.

**R2 — The sitemap and the internal links disagree about person URLs. `HIGH`**
Sitemap emits `/person/<name-slug>`; `components/MovieDetail.tsx:122` emits
`/person/tmdb-p-<id>-<name-slug>`. Two indexable pages, one person, no canonical
joining them. This is duplicate content the site generates against itself.
*Fix:* falls out of R1.

**R3 — `?genre=` accepts anything and self-canonicalises. `HIGH`**
`/movies?genre=<anything>` returns 200 with unfiltered content, a unique
canonical, and a unique title. Five hub routes × unlimited values = an unbounded
indexable duplicate space that nothing currently closes. Not yet visible in the
index sample, which makes this the one to fix **before** it becomes visible.
*Fix:* validate the genre against `genresOf()` — unknown → `noindex` or a real 404.

**R4 — `/search`: blocked, noindexed, and advertised simultaneously. `MEDIUM`**
Three mechanisms pointing three ways (§1.5). Low blast radius, but it is
incoherent and the `SearchAction` actively invites Google to a blocked path.

**R5 — `/signin`, `/signup`, `/my-list` are linked but only robots-blocked. `MEDIUM`**
Disallow without `noindex` on a crawlable-linked URL is the documented recipe for
"Indexed, though blocked by robots.txt" in Search Console.

**R6 — Soft 404s (HTTP 200 on `notFound()`). `MEDIUM`, UNVERIFIED**
Documented in three route files, never confirmed against the deployed Worker.
If real, invented ids stay in Google's crawl queue and, on the ISR routes, may
mint R2 objects. **This needs measuring against the live site before Phase 4
code is written** — it changes what the redirect module has to handle.

**R7 — No page has a `noindex` you can change without a deploy. `MEDIUM`**
Every robots directive is hardcoded. When a thin page needs pulling out of the
index, that is currently a code change — exactly the class of problem the
dashboard exists to remove.

**R8 — Renaming a page or post slug silently breaks every link to it. `MEDIUM`**
Confirmed: the only redirects on the site are the two hardcoded ones in
`next.config.mjs`. Internal Links already reports the damage; nothing can repair
it without a deploy. This is the gap that justifies the Redirects module.

**R9 — Channel pages vary by visitor region on one URL. `LOW`**
`app/channel/[slug]/page.tsx` calls `visitorRegion()` and is `force-dynamic`, so
Googlebot (crawling mostly from the US) indexes the US lineup while an Indian
visitor sees the Indian one. Not cloaking — same code for everyone — but the
indexed snapshot will not match your primary audience's view. Worth knowing;
not worth acting on yet.

**R10 — 99% of the index is a TMDB mirror. `STRATEGIC`**
Even with R1 fixed, the pages that differentiate CineTonight — blog, channels,
free-movies, FAQ — are a rounding error in the index because there are so few of
them. No technical fix reaches this. It is a publishing problem, and the Blog CMS
now built is the tool for it.

---

## 3. Sitemap Recommendations

Current output, from reading `app/sitemap.ts` end to end (~260–300 URLs):

| Block | Count | Verdict |
| --- | --- | --- |
| 8 static routes | 8 | Keep |
| Published custom pages | variable | Keep |
| Channels | 15 | Keep |
| `/free-movies`, `/follow`, `/faq` + classics | variable | Keep |
| Curated movies | 18 | Keep |
| TMDB movies, capped at 150 | ≤150 | Keep — the cap is doing real work |
| Blog posts (with honest `lastModified`) | variable | Keep |
| `/movies?genre=` | ~15–18 | Keep |
| **Person, name-form** | **≤50** | **REMOVE** |

1. **Remove the person block.** 50 URLs actively asking Google to index the thin
   pattern, and they are not even the URLs the site links to.
2. **Add `/discover`.** Canonical, ISR-cached for a day, zero data fetches, and
   currently invisible to the sitemap.
3. **Keep the 150-URL TMDB cap.** The comment explains it was added after crawl
   storms. Raising it is the fastest way to repeat them.
4. **Keep the `lastModified` discipline.** Only blog posts carry a date, because
   only blog posts have an honest one. Do not let a future SEO module start
   stamping `new Date()` — that lie is what invited the original re-crawl storm.
5. **Do not split into a sitemap index yet.** At ~250 URLs it adds complexity for
   nothing. Revisit past ~5,000.
6. **Sitemap stays generated, never hand-edited.** A dashboard toggle should
   change what `sitemap.ts` *includes*, never replace it with a stored list —
   otherwise it drifts from reality the moment anything publishes.

---

## 4. Canonical Recommendations

| Route | Canonical today | Recommendation |
| --- | --- | --- |
| `/`, `/blog`, `/discover`, `/genres` | Relative (`"/"`, `"/blog"`, …) | Fine — `metadataBase` resolves them (`app/layout.tsx:65`) |
| `/faq`, `/follow`, `/free-movies`, `/free-movies/[slug]`, `/blog/[slug]`, `/movie/[id]`, `/channel/[slug]`, `/[slug]` | Absolute via `baseUrl()` | Fine |
| Browse hubs + `?genre=` | Self-canonical via `listingMetadata` | Fine for known genres; unknown genres must not self-canonicalise (R3) |
| **`/person/[id]`** | **None** | **Add one** — and pair it with a `permanentRedirect` so slug variants collapse, exactly as `/movie/[id]:108` does. A canonical tag alone is a hint; the redirect is the enforcement. |
| `/my-list`, `/signin`, `/signup` | None | Not needed once they are `noindex` |
| `/search` | `"/search"` | Harmless; moot once §1.5 is resolved |

Two rules worth writing down before any SEO module is built:

- **A per-page `alternates` object fully replaces the root layout's.** Both
  `/movie/[id]` and `/blog/[slug]` already carry a comment about this — set
  `alternates` and you silently drop the RSS autodiscovery link unless you
  repeat it. Any dashboard-driven canonical override must merge, not replace.
- **A canonical override is a foot-gun.** Pointing a page at someone else's URL
  removes it from the index. If it ships, it needs a confirmation and an audit
  entry, same contract as every other destructive action in the dashboard.

---

## 5. Internal Linking Recommendations

Measured from the components, not guessed:

| Pattern | Links emitted per page | Where |
| --- | --- | --- |
| `/person/tmdb-p-*` | **10** (`fetchTitle` slices cast at 10) | Every movie page's cast rail |
| `/movie/*` | up to **20** | Every person page's credits grid |
| `/movie/*` | ~8 | Related + Featured rails on every movie page |
| Browse hubs, `/free-movies`, `/blog`, `/faq`, `/follow`, `/[slug]` | ~10 fixed | Footer, sitewide |
| `/my-list` | 1 | Header, sitewide |
| `/signin` | 1 | Footer, sitewide |

1. **The cast rail is the single biggest crawl-budget drain on the site.** Ten
   links per movie page, sitewide, into the pattern that is 46% of your index and
   worth the least. `noindex, follow` fixes the indexation; it does **not** stop
   the crawling. If crawl volume is still a problem after the noindex has been
   digested, the next lever is `rel="nofollow"` on cast links — but measure
   first, because those links are also what discovers new movie pages.
2. **Do not remove the cast rail.** It is real content for readers and a genuine
   discovery path to movie pages. `noindex, follow` keeps the discovery and drops
   the junk. That is the whole point of choosing `follow`.
3. **Blog posts are under-linked from the catalogue.** `BlogWidget` on movie
   pages is the only path. The Internal Links module already knows which posts
   are orphans — the missing piece is a way to link a post *from* a title page
   without editing code.
4. **Channel pages are under-linked.** 15 high-intent pages reachable from the
   homepage row and `/discover`. A "where to watch" block on movie pages that
   linked the relevant channel would be a real gain — **and it is exactly the
   kind of thing that belongs in the Discovery config, not in code.**
5. **Genre landing pages have one entry point** (`/genres` + `GenresWidget`).
   Fine as is.
6. **`/discover` is linked from the homepage but absent from the sitemap** —
   inconsistent signals about a page you clearly consider useful.

---

## 6. Proposed Phase 4 Implementation Order

Ordered by **damage removed per unit of risk**, not by the order in your plan.
Steps 1 and 2 are the ones that move the 46%.

**Step 1 — Person route hygiene. Code-only, no database, no dashboard.**
Add `robots: {index:false, follow:true}` and a canonical to `/person/[id]`; add
the `permanentRedirect` slug-collapse `/movie/[id]` already has; drop the person
block from `sitemap.ts`; add `/discover` to it.
*Why first:* biggest measurable effect, smallest diff, touches no cache
architecture, no schema, no admin surface. Fully reversible.
*Risk:* low. The one thing to get right is `follow` — `nofollow` here would cut
discovery of movie pages.

**Step 2 — Close the `?genre=` hole. Code-only.**
Validate against `genresOf()`; unknown genre → `noindex` (or 404 — a decision
worth making explicitly). Prevents a duplicate space before it opens.

**Step 3 — Verify the soft-404 behaviour on the deployed Worker.**
Measurement, not code. Three route files flag it as unverified. The answer
changes what Step 4 must handle: if `notFound()` really returns 200 in
production, the redirect module needs to cover "URL that should 404" too, not
just "URL that moved".

**Step 4 — Redirects module.** The real gap, and the one thing on this list that
genuinely needs the dashboard: renaming a slug breaks every link to it and
nothing can repair that without a deploy.
*Design sketch, for approval before any code:* a `redirects` table (`from`,
`to`, `type` 301/302, `enabled`, `note`, timestamps) read through **one cached
query tagged `cms:redirects`**, matched in `middleware.ts` against a
`Set`/`Map` of exact paths. Exact-match only in v1 — no wildcards, no regex, no
user-supplied patterns, because a bad pattern here can take the whole site
offline. Loop and self-redirect detection at save time. Auto-offer a redirect
when a slug is renamed in the Blog or Pages editor. Audit-logged like everything
else.
*Risk:* **this is the highest-risk module in the plan** — middleware runs on
every request, so a mistake is sitewide and instant. It gets the full
design/database/risk/performance/testing write-up before a line is written, and
a hard cap on the number of rules loaded.

**Step 5 — Per-page SEO controls in the dashboard.** `noindex` toggle, canonical
override, OG image, focus keyword — for Blog and Pages. Additive columns on
tables that already exist. The canonical override needs the confirmation and the
merge rule from §4.

**Step 6 — Global SEO settings.** Sitemap inclusion toggles per section, default
robots policy, verification tags. Configuration-manager pattern (`live_config` /
`draft_config` / revisions / audit) like Homepage and Discovery. **Guard rail:
the sitemap stays generated. The toggle changes what is included, never what the
URLs are.**

**Step 7 — Full regression audit, then the first deploy.**

**Not in Phase 4:** the `SearchAction` decision (a five-minute call once you tell
me which way you want `/search` to go), and `rel="nofollow"` on cast links —
that one should only happen if crawl volume is still wrong *after* Step 1 has
had time to take effect. Changing two things at once means learning nothing from
either.

---

## 7. Open questions — things I could not verify from code

1. **Does `notFound()` return HTTP 200 on the deployed Worker?** Three route
   files say yes locally and ask for production verification. Affects Steps 3–4.
2. **Do the ISR routes (`/blog/[slug]`, `/free-movies/[slug]`) persist an R2
   object per invented slug?** Needs a live check.
3. **Does `/search` currently appear in the index as a bare URL?** Search Console
   → Pages → "Indexed, though blocked by robots.txt" answers this in one click.
4. **What is the actual total indexed count?** The 53/46 split tells me the
   shape, not the size. The size decides whether the person `noindex` is a
   two-week or a two-month drop.
5. **Which way do you want `/search` to go** — keep the Disallow and drop the
   `SearchAction`, or allow crawling and rely on the `noindex`?

---

*No code was changed, no tables added, no dashboard built. Awaiting approval
before Step 1.*
