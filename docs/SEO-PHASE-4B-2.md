# 4B-2 — R2 containment

**Date:** 22 August 2026 · **LOCAL ONLY — nothing deployed.**
`tsc` clean · `npm test` **263 / 263** · both builds OK · predeploy **4/4** ·
`enableCacheInterception` still `false` · no TTL, no cache setting and no
dashboard code changed.

---

## Measured, before and after

Same test each time: ten requests to ten unique invented URLs, counting R2
objects created. Local R2 wiped first, run in the real Cloudflare Worker.

| Request pattern | Before | After |
| --- | --- | --- |
| `/blog/<plausible invented slug>` | **10 objects** | **0** |
| `/free-movies/<plausible invented slug>` | **10 objects** | **0** |
| `/movie/<junk shape>` e.g. `wp-admin.php` | 10 objects | **0** |
| `/movie/tmdb-m-99999999` (above the ceiling) | 10 objects | **0** |
| `/blog/<UPPER-CASE>` and other non-slug shapes | 10 objects | **0** |
| **`/movie/tmdb-m-<in-range invented id>`** | 10 objects | **10 — unchanged** |

Real pages verified untouched: `/`, `/blog`, `/movie/jawan`, `/free-movies`,
`/free-movies/awaara-1951`, `/discover`, `/movies?genre=Action` all still 200,
and the Phase 4A genre 308 still fires.

**Two of the three routes are now completely contained. The third is
partially contained — see §3, which is the part worth your attention.**

---

## 1. The middleware guard — all three routes, free

`lib/pathGuard.ts` + a check at the top of `middleware.ts`.

**Why middleware and not the page:** the R2 write happens *because the route
rendered*. Validating inside the page is too late — by then the object exists.
Middleware runs before any rendering, so a request it answers never reaches the
route and never creates a cache entry. It also runs **before** the Supabase
client is built, so a guarded request pays for nothing at all.

**What it rejects** — only what cannot possibly be real:

- a segment that is not slug-shaped (uppercase, dots, underscores, percent-
  encoding, a leading hyphen) — nothing this site generates looks like that
- a segment over 100 characters
- a malformed TMDB id: `tmdb-x-123`, `tmdb-m-abc`, `tmdb-m-0`
- a TMDB id above **20,000,000** — an order of magnitude above TMDB's real ids,
  so it will not start rejecting real titles for years

**What it deliberately allows through:** any well-formed slug it has never
heard of. The catalogue and the blog both grow from the dashboard, and
middleware must not touch the database.

> **The asymmetry decides every judgement call in that file:** rejecting
> something valid takes a real page off the site; letting something invalid
> through costs one cache object. So the guard is shallow on purpose.

It is a regex and a length comparison. No database, no network, no `await`,
nothing that can throw — which is what makes it safe on the file every request
passes through. Guarded responses carry `Cache-Control: no-store` and an
`x-cinetonight-guard` header naming the check that fired, so it is debuggable
from a `curl -I`.

## 2. `/blog/[slug]` and `/free-movies/[slug]` → `force-dynamic`

The guard cannot know which *well-formed* slugs are real. Only this closes the
remainder, and it takes both routes to **zero**.

**What it costs:** a real article is no longer persisted between requests. It is
still absorbed by the Cloudflare edge cache — `next.config.mjs` already gives
`/blog/:path*` and `/(free-movies|…)/:path*` an `s-maxage=3600` — and **the
edge is free, unlike the R2 incremental cache.** Googlebot receives identical
HTML either way, so nothing about indexing changes. The Supabase reads behind
these pages are cached on their own tier, so this adds no database traffic
either — which matters on the free plan.

This is the same trade already made twice on this codebase, for the same
reason: `/person/[id]` and `/[slug]` are both force-dynamic, and both measured
**0** objects for invented URLs.

`generateStaticParams` was removed from `/blog/[slug]` — it has no meaning on a
force-dynamic route.

---

## 3. `/movie/[id]` — the honest remainder

**ISR is untouched, exactly as you asked.** Valid movie pages still cache and
still perform identically. The guard removed the malformed and out-of-range
junk for free.

**What is still open:** a well-formed, in-range but nonexistent id —
`/movie/tmdb-m-14999` — still renders and still writes one R2 object. Measured:
10 requests, 10 objects, unchanged.

Shape-checking cannot fix this. Telling "exists on TMDB" from "does not" needs
a lookup, and a lookup in middleware is exactly what the architecture forbids.
The space is bounded by the ceiling at 20 million rather than being infinite,
but 20 million is not a comfort.

**Two levers remain, and I did not take either without you:**

**(a) `force-dynamic` on `/movie/[id]`** — takes it to zero, same as the other
two. But this is the money page and the highest-traffic route, and you asked
twice to keep its behaviour until you have the Cloudflare numbers. Still your
call, still waiting on request volume and cache hit ratio.

**(b) An R2 lifecycle rule — my recommendation, and it costs nothing.**
Cloudflare → R2 → `cinetonight-cache` → Settings → Object lifecycle rules →
delete objects older than **30 days**.

This is the neat fit for how ISR actually behaves. A page with real traffic is
rewritten every time it revalidates, so its object's age keeps resetting and it
never expires. A junk object is written once and never touched again — so it
ages out and is deleted. **The rule removes exactly the objects nothing is
using, and leaves the ones that are.** It is configuration, not code, it does
not touch valid page performance, and it caps storage growth permanently
regardless of what any crawler does.

I would do (b) now and leave (a) until the analytics say it is worth it.

---

## What did not change

`enableCacheInterception` still `false`. No TTL, no revalidate tier, no R2 or
regional-cache setting, no DO queue, no `open-next.config.ts`, no
`wrangler.jsonc`, no dashboard code, no database. `/movie/[id]` keeps ISR at
its existing tier. The `/blog` index and `/free-movies` landing pages keep
theirs (10m and 1d).

**Still a soft 404 on `/movie/[id]`** — an invented id returns 200, because
`app/movie/[id]/loading.tsx` is still in place under your instruction. Worth
saying plainly: fixing that would **not** reduce R2 writes at all. It was
measured separately in 4B-1 — status codes and cache writes are independent
problems. It is a crawl-budget and Search Console issue, not a cost one, and it
is one route-group move away whenever you want it.

---

## Files

**New:** `lib/pathGuard.ts`, `tests/pathGuard.test.mjs` (12 tests, most of them
asserting that real URLs are *never* blocked).

**Changed:** `middleware.ts` (the guard, above everything else),
`app/blog/[slug]/page.tsx` and `app/free-movies/[slug]/page.tsx`
(`force-dynamic`).

---

## Your move

1. **R2 lifecycle rule, 30 days** — five clicks in Cloudflare, caps the
   remaining growth on `/movie/[id]`.
2. **Cloudflare analytics for `/movie/*`** — still the last open decision.
3. Deploy this with the batch when you are ready.

*Nothing deployed.*
