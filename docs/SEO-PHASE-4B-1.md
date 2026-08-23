# SEO 4B-1 — soft 404 fixed, and the /person URL decision

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed.**

`tsc` clean · `npm test` **200 / 200** · `next build` OK ·
`opennextjs-cloudflare build` OK · predeploy **4/4** ·
no cache setting, TTL or tier changed · no database changes · no dashboard work.

---

## Part 1 — Your question: how should the two /person URL patterns be consolidated?

**Decision: keep all three — `noindex, follow` + canonical + redirect — but be
clear about which one is load-bearing.**

> **`noindex` is the fix. The canonical and the redirect are cheap insurance.**

### Why `noindex` alone is sufficient for SEO

Canonicalisation exists to **merge ranking signals** between duplicate URLs. A
`noindex` page has no ranking signals to merge. Once every spelling of a person
URL is noindexed, having four of them is harmless — Google reports them all as
"Excluded by noindex" and drops them. The redirect adds **zero** SEO benefit on
top of that. Anyone claiming otherwise is describing what canonicals do for
*indexed* pages.

So if the redirect ever misbehaves, **it can be deleted without weakening the
SEO outcome at all.** That is the property that makes this safe.

### Why keep it anyway — three concrete reasons

1. **~50 name-form URLs were submitted in your sitemap** until Phase 4A removed
   them. Those are likely in Google's index right now. A 308 collapses them
   onto one address as they are re-crawled — tidier than four independent
   "excluded" entries, and it means Search Console shows one URL per person
   instead of a scatter.
2. **Crawl budget.** Each person URL variant Google crawls is a full
   `force-dynamic` Worker render plus a TMDB person fetch plus a filmography
   lookup. A 308 is a few hundred bytes. Variants only exist from external
   links or old index entries, so this is small — but it is real, and it is
   free to have.
3. **It keeps the option open.** If person pages ever become substantial enough
   to index, one canonical URL is already enforced. Retro-fitting that after
   the fact is much harder.

### R2 impact: **zero, in every variation.**

Measured, not assumed. `/person/[id]` is `force-dynamic`, and force-dynamic
routes write **nothing** to the incremental cache:

| What was requested | R2 objects created |
| --- | --- |
| 20 invented URLs on `/person/[id]` and `/[slug]` (force-dynamic) | **0** |
| 15 invented slugs on `/blog/[slug]` + `/free-movies/[slug]` (ISR) | **15** |
| 8 invented ids on `/movie/[id]` (ISR) | **8** |

So the person decision is **free on the R2 axis**, whichever way it goes. That
is exactly why `/person/[id]` was made force-dynamic after the 2.79M-object
incident, and it is why this route is no longer the expensive one.

### The one thing that had to change to make the redirect honest

In Phase 4A I flagged that the person redirect was **not a real 308** — it was
a 200 with a client-side redirect payload, so it cost a full render *plus* a
40 KB shell *plus* a second request. That is worse than having no redirect.

`app/person/[id]/loading.tsx` was the cause (see Part 2). It is now removed, so
the redirect is real. **Verified in the Worker** — I injected a TMDB id into the
offline catalogue fixture to exercise the path, then reverted the fixture:

```
/person/rajkummar-rao                  308 → /person/tmdb-p-587506-rajkummar-rao
/person/tmdb-p-587506                  308 → /person/tmdb-p-587506-rajkummar-rao
/person/tmdb-p-587506-anything-at-all  308 → /person/tmdb-p-587506-rajkummar-rao
/person/tmdb-p-587506-rajkummar-rao    200   (canonical — no redirect)
hops: 1
```

Four URL forms, one address, one hop, real 308. **This is the first time the
person redirect has actually worked**, and it revises the "leave `loading.tsx`
for now" line in the design doc — that recommendation was made before I knew
the redirect depended on it.

**The cost:** person pages lose their loading skeleton. That is the right route
to spend that on — it is `noindex`, low-value, and the least important page on
the site.

---

## Part 2 — 4B-1 implemented: the soft 404

### The approach: route groups, not deletions

The design said "move the boundary, don't delete it". The cleanest way turned
out to be a **route group**, which costs no logic change at all:

| Was | Now | URL |
| --- | --- | --- |
| `app/page.tsx` + `app/loading.tsx` | `app/(home)/page.tsx` + `app/(home)/loading.tsx` | `/` — unchanged |
| `app/blog/page.tsx` + `app/blog/loading.tsx` | `app/blog/(index)/page.tsx` + `app/blog/(index)/loading.tsx` | `/blog` — unchanged |
| `app/blog/[slug]/loading.tsx` | removed | — |
| `app/person/[id]/loading.tsx` | removed | — |

A `(folder)` in App Router is excluded from the URL. So the homepage keeps its
skeleton — it has the heaviest fetch on the site and can never 404 — while
every route that *can* 404 is now outside the boundary. **No page logic was
touched. No URL moved. No tier changed** (`/` still 15m, `/blog` still 10m).

`app/genres/loading.tsx` and `app/my-list/loading.tsx` were left alone: neither
route has a dynamic segment, so neither can ever 404.

### Verified in the real Cloudflare Worker

| Request | Before 4B-1 | Now |
| --- | --- | --- |
| `/this-page-does-not-exist` | 200 | **404** |
| `/channel/not-a-channel` | 200 | **404** |
| `/free-movies/nope` | 200 | **404** |
| `/blog/this-post-does-not-exist` | 200 | **404** |
| `/person/tmdb-p-999999999` | 200 | **404** |
| `/movie/tmdb-m-999999999` | 200 | **200 — deferred, see below** |

And nothing else moved: `/`, `/blog`, `/movie/jawan`, `/person/shah-rukh-khan`,
`/free-movies`, `/discover`, `/genres`, `/movies?genre=Action` all still 200,
and the Phase 4A genre redirect still emits its 308.

### `/movie/[id]` — deliberately untouched

You said not to change `/movie/[id]` behaviour until the Cloudflare analytics
review. `app/movie/[id]/loading.tsx` is therefore still in place, and that route
still returns 200 for an invented id.

**What that costs while it waits:** it is the largest soft-404 surface on the
site — the id space is every integer, and each invented id is both a Soft 404
in Search Console and a permanent R2 object.

**What I would do when you are ready, and it is smaller than it sounds:** the
same route-group move (`app/movie/(detail)/[id]/…`), which keeps the skeleton
exactly as it is and changes no caching, no TTL and no rendering mode. It is
independent of the force-dynamic question your analytics review is actually
about. Say the word and it is a five-minute change — but it is your money page,
so I am not touching it without you.

### A note on what 4B-1 does *not* fix

Worth repeating because it is counter-intuitive: **a correct 404 still writes
an R2 object on an ISR route.** Measured — 20 invented URLs produced 20 objects
even with correct 404 statuses. Status codes and R2 cost are separate problems.
The R2 half is 4B-2, next.

---

## Files changed

**Moved (no content change beyond comments):** `app/page.tsx` →
`app/(home)/page.tsx`, `app/loading.tsx` → `app/(home)/loading.tsx`,
`app/blog/page.tsx` → `app/blog/(index)/page.tsx`, `app/blog/loading.tsx` →
`app/blog/(index)/loading.tsx`.

**Removed:** `app/blog/[slug]/loading.tsx`, `app/person/[id]/loading.tsx`.

**Untouched:** every cache setting, every TTL, `open-next.config.ts`,
`wrangler.jsonc`, `next.config.mjs`, `middleware.ts`, all Supabase schema,
every dashboard screen, and `app/movie/[id]/`.

---

## Next: 4B-2

`force-dynamic` on `/blog/[slug]` and `/free-movies/[slug]` — both already carry
the `s-maxage=3600` CDN header, both have small real page counts, and the
pattern is proven twice on this codebase. `/movie/[id]` stays out of it pending
your analytics review.

*Nothing deployed.*
