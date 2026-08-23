# 4B-3 — pre-implementation R2 measurement

**Date:** 22 August 2026 · **MEASUREMENT ONLY — probe reverted, tree clean.**
`tsc` clean · `npm test` **219 / 219** · both builds OK · predeploy **4/4**.

Method: one build with a conditional probe, so a slug beginning
`redir-probe-` took the redirect path and any other unknown slug took the
existing `notFound()` path. **Same binary, same runtime, same R2 bucket** — the
only variable is the response type. Local R2 state was wiped first so the
counts are clean. Run in the real Cloudflare Worker (`wrangler dev --local`).

---

## Headline answer

> **Yes — a redirect on an ISR route is cached into R2, exactly like a 404.
> One object per old slug, ~77 KB minimum.**

For redirects that is **fine and bounded**: the 500-rule cap means at most 500
objects, they are written once, and every later hit is a cache hit that never
touches Supabase. A cached redirect is the cheapest possible outcome.

**The design does not change. Implementation can start.**

But the same run confirmed something worse about the 404 path, which does
change 4B-2's priority. See §4.

---

## 1. R2 object count

10 requests to 10 unique slugs, per case:

| # | Case | Status | R2 objects created |
| --- | --- | --- | --- |
| 1 | `/blog/<invalid>` — no redirect | **404** ×10 | **10** |
| 2 | `/blog/<invalid>` — redirect | **308** ×10 | **10** |
| 3 | `/free-movies/<invalid>` — no redirect | **404** ×10 | **10** |
| 4 | `/free-movies/<invalid>` — redirect | **308** ×10 | **10** |

Identical. The ISR cache does not care what the response was — it persists the
result keyed by the requested path either way.

**Repeat hits to the same slugs: 0 new objects.** Written once, served from
cache thereafter, for both 404s and redirects.

**Object size:** 41 objects, smallest **77,530 B**, largest 322,382 B, and
**none under 20 KB**. A redirect entry is not a small object — it carries the
full prerender payload. Worth knowing before assuming redirects are free.

---

## 2. Response status

All four cases returned the correct status in the real Worker: **404** where
expected, **308** with a correct `Location` where expected. 4B-1's Suspense fix
holds on both routes, and an in-render `permanentRedirect()` is a genuine HTTP
redirect here.

---

## 3. Cache behaviour — and a correction to an earlier claim

| Case | `Cache-Control` on the response |
| --- | --- |
| **404** | `private, no-cache, no-store, max-age=0, must-revalidate` |
| **308** | `s-maxage=3569, stale-while-revalidate=2592000` |

Both showed `x-nextjs-cache: HIT` and `x-nextjs-prerender: 1` on repeat, which
is the R2 entry being re-served.

**Correction.** The production release audit said `notFound()` responses carry
`s-maxage=3600` from the `next.config.mjs` header rule, so junk URLs would sit
in the CDN for an hour. **That is wrong.** Next overrides it with `no-store`,
so **404s are not edge-cached at all** — every crawler hit on an invented URL
reaches the Worker. Only R2 absorbs the render. That makes the 404 path more
expensive than I described, not less.

**Redirects behave differently and better:** the 308 keeps the header rule's
`s-maxage`, so the CDN absorbs repeat hits for free.

**But that same header is a problem for the design.** The 308 carries
`stale-while-revalidate=2592000` — **30 days** — and no `max-age`, so browsers
are free to cache it heuristically and the edge holds it for a month. That is
precisely the "permanent redirect you cannot take back" hazard §4 of the design
flagged, and it is currently unmitigated.

**Design change (the only one this measurement forces):** redirect responses
must set their own explicit, short `Cache-Control` rather than inheriting the
blog/free-movies rule. Combined with rules starting as **307** and being
promoted to 308 deliberately, a mistake stays recoverable.

---

## 4. Worker time

Wall-clock per request, averaged over 6 runs each (local Worker, so treat as
relative — the shape is what matters, not the absolute numbers):

| Case | Cold (new slug: render + R2 write) | Warm (cached) |
| --- | --- | --- |
| `/blog` 404 | 59.8 ms | 25.6 ms |
| `/blog` 308 | 88.5 ms | 20.8 ms |
| `/free-movies` 404 | 51.6 ms | 17.8 ms |
| `/free-movies` 308 | 49.5 ms | 19.7 ms |
| *(reference)* `/blog`, real page, cached | — | 33.6 ms |

Cold is 2.5–4× warm, which is the render plus the R2 write. Warm redirects and
warm 404s are both **cheaper than serving a real page** — as expected, there is
almost nothing to send.

The 88.5 ms cold figure for `/blog` 308 is a single noisy sample set, not a
real difference; `/free-movies` 308 came in at 49.5 ms against its 404's
51.6 ms. There is no meaningful cost difference between the two response types.

---

## 5. What this changes

**For 4B-3 — nothing structural.** Redirect entries in R2 are bounded by the
rule cap, written once, and cheap to re-serve. One addition: **the explicit
`Cache-Control` on redirect responses** from §3. Implementation proceeds.

**For 4B-2 — it gets more urgent, not less.** The 404 path is worse than
documented: an unbounded URL space, one ~77 KB+ R2 object per invented slug,
**and no edge caching**, so every crawler hit is a Worker invocation. The
`force-dynamic` fix removes all three at once. I would move it back ahead of
the Redirect Manager if you want the cost stopped first — but it is your call,
and the content decisions waiting on redirects are real.

---

## 6. Structured reason field — added to the design

Per your request, `redirects.reason` replaces the free-text-only `note`:

```sql
reason text not null default 'other'
  check (reason in ('slug_change','content_merge','duplicate_removal',
                    'migration','seo_cleanup','other'));
note   text;   -- free text, still there, for the detail
```

| Value | Dashboard label | When |
| --- | --- | --- |
| `slug_change` | Slug change | A post or page was renamed. **Auto-set by the rename auto-offer** |
| `content_merge` | Content merge | Two articles folded into one — e.g. the weekend roundups |
| `duplicate_removal` | Duplicate removal | Two URLs served the same thing — e.g. `/contact-us` |
| `migration` | Migration | Bulk import from an older structure. **Auto-set by bulk import** |
| `seo_cleanup` | SEO cleanup | Retiring a thin or cannibalising URL |
| `other` | Other | Default; the note carries the detail |

Why it earns its place: it makes the redirect table **auditable at a glance**
in six months, it lets Activity filter by why rather than only what, and two of
the six are set automatically by the flows that create most rules — so it costs
nothing at the point of use. A closed set with a database-level `check`, so it
cannot drift.

---

## 7. Ready to implement

Build order from the design, unchanged apart from step 1 now being done:

1. ~~Measure ISR-redirect R2 behaviour~~ ✅ **done — no blocker**
2. `lib/redirects.ts` — pure: normalise, validate, flatten, detect loops. Tests first.
3. `supabase/redirects.sql` — including the `reason` column above.
4. `/api/admin/redirects` — CRUD, bulk import dry-run + apply, limits, audit.
5. `redirectOrNotFound` helper → `/blog/[slug]` and `/[slug]`, with the
   explicit `Cache-Control` from §3.
6. Dashboard screen with the URL tester.
7. Auto-offer on slug rename.
8. Worker verification, then migration A, then migration B.

*Probe reverted. Tree is at the approved state. Nothing deployed.*
