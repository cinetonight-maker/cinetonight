# SEO Phase 4A — quick wins

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed.**

`tsc` clean · `npm test` **200 / 200** · `next build` OK ·
`opennextjs-cloudflare build` OK · predeploy gate **4/4** ·
`enableCacheInterception` still `false` · no admin JS in any public route ·
**no public route's revalidate tier changed** · no database tables added ·
no dashboard controls built.

Scope was the three approved items. One of them changed shape once it was
measured — that is written up in full below rather than buried.

---

## 1. The soft-404 verification you asked for — and it changed the plan

Run against the **real Cloudflare Worker** (`opennextjs-cloudflare build`, then
`wrangler dev --local`), not `next dev`.

| Request | Status | What comes back |
| --- | --- | --- |
| `/movie/tmdb-m-999999999` (invented movie) | **200** | Not-found view |
| `/person/tmdb-p-999999999` (invented person) | **200** | Not-found view |
| `/blog/this-post-does-not-exist` | **200** | Not-found view |
| `/free-movies/this-classic-does-not-exist` | **200** | Not-found view |
| `/this-page-does-not-exist` (root catch-all) | **200** | `<title>Page</title>` |
| `/channel/not-a-channel` | **200** | Not-found view |
| `/movie/a/b/c` (no route matches at all) | **404** | Real 404 |
| `/nope/nope/nope` | **404** | Real 404 |

**Confirmed: the soft 404 is real in production-shaped runtime.** The pattern is
exact — a path that matches **no route** 404s correctly; `notFound()` called
from **inside** a matched route returns **200**. Three route files had flagged
this as unverified since it was first suspected. It is now verified.

Mitigating detail worth knowing: Next injects `<meta name="robots"
content="noindex">` into the not-found render automatically, so these pages are
not indexable. But Google still reports them as **Soft 404** and still spends
crawl budget re-fetching invented ids. The `notFound()` responses also carry
`Cache-Control: s-maxage=3600`, so junk URLs sit in the CDN for an hour.

### The second finding, which is the one that mattered

While implementing the genre fix I put a `permanentRedirect()` in the page, as
`/movie/[id]` does. Measured in the same Worker:

> **An in-render `permanentRedirect()` returns HTTP 200 with a client-side
> redirect payload — not a 308.**

Same root cause as the soft 404: this stack does not turn render-time control
flow into an HTTP status. A redirect that only happens once JavaScript runs is
worth nothing to Googlebot's canonicalisation.

What *does* emit a real 308, both verified:

- `next.config.mjs` redirects (`/p/:slug` → `/:slug` → **308**)
- **`middleware.ts`** (the new genre rule → **308**)

**This is the most important thing 4A found, and it changes Phase 4's plan:
the Redirects module MUST live in middleware.** Had it been built as an
in-page redirect, every rule would have silently been a 200 and you would have
believed your redirects worked when they did not.

---

## 2. Person pages — the 46%

**Route is now `noindex, follow`.** Verified live: `/person/shah-rukh-khan`
returns `<meta name="robots" content="noindex, follow">`.

`follow` is deliberate. The credits grid is a genuine discovery path to
`/movie/*` pages — the ones you want ranked. `follow` keeps that link value
moving while the page itself leaves the index. **No robots.txt Disallow was
added**, exactly as you instructed: a blocked URL is never crawled, so Google
would never read the noindex and the URLs would sit in the index forever.

**Canonical added.** Self-referential, pointing at the person's one true URL —
never at a different page, because Google documents that a canonical to
elsewhere combined with `noindex` can transfer the noindex to the target.

**Duplication resolved.** `lib/personUrl.ts` (new, pure, unit-tested) defines
one canonical id per person, and the route permanently redirects anything else:

```
/person/tmdb-p-35742                    ─┐
/person/tmdb-p-35742-shah-rukh          ─┼─→  /person/tmdb-p-35742-shah-rukh-khan
/person/tmdb-p-35742-anything-at-all    ─┤
/person/shah-rukh-khan                  ─┘   ← the form the sitemap used to submit
```

A TMDB id always wins, because that is the form every cast link on the site
already emits. The name form remains only for a catalogue person with no TMDB
id. Tests assert that a redirect target is never itself redirected — no chains,
no loops.

**Caveat, stated plainly:** that redirect is subject to the finding in §1 — on
this stack it is a 200 with a client-side redirect, not a 308. It is therefore
a tidy-up, **not** the fix. The fix is the `noindex`, which works regardless of
status code and applies to every spelling of the URL. When the redirect layer
lands in Phase 4 (middleware), this rule can move there and become a real 308.
I did not move it now because middleware cannot know a person's TMDB id without
a data lookup, and putting a lookup in middleware is precisely the risk the
audit warned about.

**Two bugs found while doing this, both fixed:**

1. **The slug rule existed three times** — in `lib/tmdb.ts` (which *builds*
   every cast link), in `lib/data.ts` (which *resolves* them), and in the new
   module. They had **already drifted**: `lib/data.ts`'s copy was missing the
   60-character cap, so a name longer than 60 characters produced a link that
   the lookup could never match. With a redirect on the route, that becomes an
   infinite bounce between two spellings of one URL. All three now read one
   definition, and a test fails the build if a private copy reappears.
2. **A TMDB outage would have made things worse.** Redirecting the name form to
   the TMDB form meant the canonical URL could only be resolved through a live
   TMDB call. The route now checks the local catalogue by TMDB id first, so a
   person you already hold resolves from local data even when TMDB is down.

**Sitemap:** the person block is gone. It submitted up to 50 URLs — asking
Google to index pages now marked `noindex`, and not even the URLs the site
links to. Verified: **0 person URLs in the generated sitemap.**

---

## 3. `/discover` added to the sitemap

It was linked from the homepage but absent from the sitemap — contradictory
signalling about a page the site clearly treats as useful. It is canonical,
ISR-cached for a day and does zero data fetches, so listing it costs nothing.
Verified present.

---

## 4. Unknown genre URLs — closed with a real 308

**The decision you asked me to make: redirect, not 404, and not noindex.**
Reasoning, in order:

- **404 was ruled out by measurement.** `notFound()` is a soft 404 on this
  stack (§1). Choosing "404" would have shipped a 200 that Google reports as an
  error — strictly worse than doing nothing. It would also have been dishonest:
  the page renders real, valid content (the unfiltered hub).
- **`noindex` was second best.** It asks Google to ignore the duplicate but
  leaves it existing and crawlable.
- **A redirect removes the duplicate outright**, lands the visitor on a page
  that works, and consolidates any standing the junk URL picked up.

It lives in `middleware.ts` because that is the only layer here where a
redirect is real. Verified in the Worker:

| Request | Result |
| --- | --- |
| `/movies?genre=made-up-genre` | **308** → `/movies` |
| `/trending?genre=nonsense` | **308** → `/trending` |
| `/movies?genre=All` | **308** → `/movies` |
| `/movies?genre=` (empty) | **308** → `/movies` |
| `/movies?genre=Action%20%26%20Adventure` | **308** → `/movies?genre=Action` |
| `/tv-shows?genre=Sci-Fi%20%26%20Fantasy` | **308** → `/tv-shows?genre=Sci-Fi` |
| `/movies?genre=Action` | 200 — untouched |
| `/latest?genre=Horror` | 200 — untouched |

Every redirect is **one hop** — verified by following them; a target is never
itself redirected.

### The bug this exposed

There were **two disagreeing genre lists** in the codebase: the 17 names the
filter UI offered, and whatever `genresOf()` found in the catalogue. The
sitemap used the second one — so it was submitting
`/movies?genre=Action%20%26%20Adventure`, TMDB's **TV-only** genre name, which
does **not** filter a movie query. That URL rendered the unfiltered hub under
its own canonical tag. **The sitemap was advertising an example of the exact
duplicate-page bug this task was about.**

There is now one list, in `lib/genres.ts`, read by the filter UI, the sitemap,
the metadata and the middleware. TMDB's TV-side names fold onto the movie name
that owns the URL, so one genre has one address. A test fails the build if a
sixth browse hub is ever added without telling the middleware about it.

**Knock-on cleanups:** `/genres` had two tiles for Action (one of them linking
the non-filtering URL) — now deduped, 11 tiles to 10. The sidebar Genres widget
and the sitemap's genre block got the same treatment. Verified: no aliased
genre link is emitted anywhere on the site.

### Safety of the middleware change

The whole site passes through `middleware.ts`, so this is the riskiest edit in
4A and was written accordingly: a `Set` lookup on the pathname, then one lookup
in a hard-coded static table. **No database, no network, no `await`, no
user-supplied patterns, and nothing in it can throw.** It runs before the
Supabase session work, so a redirected request never pays for a session refresh
either. There is a second line of defence in the page itself — the genre is
folded to canonical form before it reaches the query, so even a request that
somehow bypassed middleware renders the plain hub with the bare hub's title and
canonical, minting no duplicate.

---

## 5. What was verified, and what could not be

Verified in the real Worker: status codes (§1), every genre redirect (§4),
one-hop behaviour, `noindex, follow` and the canonical on person pages, sitemap
contents (**78 URLs, all returning 200, none redirecting**), and that no
aliased genre link is emitted anywhere.

**Could not be verified here:** anything that needs a live TMDB call.
**TMDB is not reachable from this sandbox** (outbound blocked), so the
`tmdb-*` resolution path — and therefore the person redirect actually firing —
could not be exercised end to end. That logic is covered by unit tests instead
(`tests/personUrl.test.mjs`, 10 cases). The sitemap measured here has 78 URLs
because the TMDB block came back empty; in production it will also carry up to
150 `/movie/tmdb-*` URLs, unchanged by this work.

---

## 6. Files changed

**New:** `lib/genres.ts`, `lib/personUrl.ts`, `tests/genres.test.mjs`,
`tests/personUrl.test.mjs`, this document.

**Changed:** `middleware.ts` (the 308), `app/person/[id]/page.tsx`,
`app/sitemap.ts`, `app/genres/page.tsx`, the five browse hub pages,
`components/ListingPage.tsx`, `components/Listing.tsx`,
`components/RightRail.tsx`, `lib/site.ts`, `lib/tmdb.ts`, `lib/data.ts`.

**Untouched:** every cache setting, every TTL, `open-next.config.ts`,
`wrangler.jsonc`, `next.config.mjs`, the D1 tag layer, all Supabase schema, and
every dashboard screen.

---

## 7. What this means for the rest of Phase 4

1. **The Redirects module goes in middleware.** Not negotiable any more — §1
   proves an in-page redirect is a 200 on this stack. The genre rule is a
   working reference implementation of the shape: static data, synchronous,
   cannot throw. The database-backed version needs one cached read and a hard
   cap on rule count, and still deserves the full design write-up first.
2. **The soft 404 is now a known, measured defect** rather than a suspicion.
   Worth deciding whether to fix it (an OpenNext-level concern) before or after
   the Redirects module — the two interact, since "this URL should 404" and
   "this URL moved" are the same table.
3. Steps 5 and 6 from the audit (per-page SEO controls, global SEO settings)
   are unaffected and can proceed as planned.

---

*Nothing deployed. No tables added. No dashboard controls built — the rules are
correct first, the management UI comes after, as instructed.*
