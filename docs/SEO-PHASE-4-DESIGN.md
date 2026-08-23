# SEO Phase 4 — design review

**Date:** 21 August 2026 · **DESIGN ONLY — no code changed.**
Tree is at the approved Phase 4A state: `tsc` clean, **200/200 tests**, both
builds OK, predeploy **4/4**.

Everything below is measured, not assumed. The experiments were run, the
findings recorded, and every experimental change reverted.

---

## 0. The finding that reshapes this whole phase

I set out to answer "what is the safest OpenNext/Cloudflare approach to the
soft 404". The answer is: **none, because it is not an OpenNext or Cloudflare
problem.**

**Reproduced in plain `next start` (Node runtime, no OpenNext, no Cloudflare):**

| Request | `next start` | Worker |
| --- | --- | --- |
| `/blog/does-not-exist` | 200 | 200 |
| `/movie/tmdb-m-999999999` | 200 | 200 |
| `/this-page-does-not-exist` | 200 | 200 |
| `/channel/not-a-channel` | 200 | 200 |

Identical. So the adapter was never at fault, and there is no adapter setting
to go looking for.

### The actual cause: `loading.tsx`

A `loading.tsx` file creates a Suspense boundary. The shell flushes — **with
its 200 status** — before the page component can set a different one. Proven by
removing the root `app/loading.tsx` and rebuilding:

| Request | With root `loading.tsx` | Without |
| --- | --- | --- |
| `/this-page-does-not-exist` | 200 | **404** |
| `/channel/not-a-channel` | 200 | **404** |
| `/free-movies/nope` | 200 | **404** |
| `/blog/does-not-exist` | 200 | 200 — has its own `app/blog/loading.tsx` |
| `/movie/tmdb-m-999999999` | 200 | 200 — has its own `app/movie/[id]/loading.tsx` |

Then removing `app/movie/[id]/loading.tsx` too: `/movie/tmdb-m-999999999` →
**404**. A `loading.tsx` at a **parent** segment covers its children, which is
why `/blog/[slug]` stayed at 200 until `app/blog/loading.tsx` was also gone.

### And the same fix makes redirects real

The decisive test. Root `loading.tsx` removed, an in-render
`permanentRedirect()` put back into `app/movies/page.tsx`, rebuilt, run in the
**real Cloudflare Worker**:

```
308 -> http://localhost:8787/movies
```

**One root cause explains both defects.** Phase 4A concluded "the Redirects
module MUST live in middleware". That conclusion was correct given what was
known then, and it is now **superseded**: once the boundary is fixed, an
in-page redirect emits a real 308. That reopens a far cheaper and far safer
architecture, and it is the reason the soft 404 must be fixed first.

**Current `loading.tsx` inventory:** `app/`, `app/blog/`, `app/blog/[slug]/`,
`app/genres/`, `app/my-list/`, `app/movie/[id]/`, `app/person/[id]/`.

---

## 1. Soft 404 handling

### Should it be fixed before the Redirects module? **Yes — for two reasons.**

1. **It decides where the Redirect Manager can live.** Build Redirects first and
   you are forced into middleware — the highest-risk layer on the site, running
   on every request, with a hard "no database lookups" constraint that makes
   dashboard management awkward. Fix the boundary first and redirects can live
   in the page layer, costing nothing on the happy path.
2. **It is not only an SEO issue. It is an open R2 write vector.** See below.

### The R2 finding — measured, and worse than the status code

Counting objects in the local R2 bucket before and after:

| What was requested | R2 objects created |
| --- | --- |
| 15 invented slugs on `/blog/[slug]` and `/free-movies/[slug]` | **15** (~2 MB) |
| 8 invented ids on `/movie/[id]` | **8** |
| 20 invented URLs on `/person/[id]` and `/[slug]` (`force-dynamic`) | **0** |
| Repeat hits to the *same* invented slug | **0** — already cached |

**One permanent R2 object per invented URL, on every ISR route.** Average
~137 KB each. The id space on `/movie/[id]` is every integer; the slug space on
`/blog/[slug]` is every string. This is the mechanism that produced
**2.79M objects / 211 GB / ~1M writes a day** — the incident that led to
`/person/[id]` being made `force-dynamic`. That fix was applied to one route.
**The same hole is still open on three others.**

And the critical detail:

> **Fixing the status code does NOT stop the R2 write.** Measured: with the
> loading boundaries removed, `/movie/tmdb-m-999999999` returns a correct 404 —
> and 20 invented ISR URLs still created 20 R2 objects.

Next persists the not-found result in the ISR cache regardless of status.
**These are two separate problems that happen to share a symptom**, and they
need two separate fixes. Treating them as one is the mistake to avoid.

### Global or route by route? **Route by route.**

`loading.tsx` is real UX — it is the skeleton a visitor sees while a page
loads. Deleting all seven globally would fix the status everywhere and make
every navigation feel dead. The blast radius is per-route, so the decision
should be per-route.

Only three routes have an **unbounded** parameter space, and they are the only
ones where a wrong status has any cost: `/movie/[id]`, `/blog/[slug]`,
`/free-movies/[slug]`. `/genres` and `/my-list` have no parameters and can keep
their skeletons untouched.

**Preferred fix — move the boundary, don't delete it.** Replace `loading.tsx`
with an explicit `<Suspense>` **inside** the page, wrapping only the slow parts
(the TMDB-fed Related/Featured rails, the cast rail). The page shell — and
therefore the status — resolves before anything flushes, while the skeleton
survives where it actually matters. Plain deletion is the fallback if that
turns out fiddly on a given route.

**Recommended per-route decision:**

| Route | Action | Why |
| --- | --- | --- |
| `app/loading.tsx` (root) | Move Suspense into the pages that need it | Fixes `/channel`, `/[slug]`, `/free-movies/[slug]` in one change |
| `app/movie/[id]/loading.tsx` | Move Suspense around the rails | Money page — keep the skeleton for the slow half |
| `app/blog/loading.tsx` + `app/blog/[slug]/loading.tsx` | Move or remove | Blog pages are fast; there is little to skeleton |
| `app/person/[id]/loading.tsx` | Leave for now | Route is `noindex` and writes no R2 — nothing to gain |
| `app/genres/`, `app/my-list/` | Leave alone | No parameters, no unbounded space |

### Cache and R2 impact of the status fix itself

**None on cost.** A real 404 and a soft 404 both write the same ISR object. What
changes is what Google does with it — Search Console stops reporting Soft 404,
and crawlers stop keeping invented ids in their re-crawl queue, which reduces
requests over time. One caveat worth naming: `notFound()` responses currently
carry `Cache-Control: s-maxage=3600` from the `/(free-movies|genres|channel|blog|faq|follow)/:path*`
header rule, so junk URLs sit in the CDN for an hour. That is *good* — the edge
absorbs the repeat hits for free. No change recommended.

### Containing the R2 vector — a separate decision

Three options, and I would not pick the same one for all three routes.

| Option | Effect | Cost |
| --- | --- | --- |
| **A. `force-dynamic` + the existing CDN header** | R2 writes drop to **zero** (measured on `/person` and `/[slug]`) | Every edge miss becomes a Worker render |
| **B. R2 object lifecycle rule** | Junk objects expire after N days; the bucket cannot grow forever | Does not stop the writes, only the storage; real pages age out too |
| **C. Bound the id space in middleware** | Rejects `tmdb-m-999999999` with pure arithmetic — no lookup, no render, no write | Only catches out-of-range ids, not in-range misses |

**Recommendation:**

- **`/blog/[slug]` and `/free-movies/[slug]` → option A.** Both have small real
  page counts and low traffic, both already carry the `s-maxage=3600` CDN
  header, and the pattern is proven twice on this codebase. Near-zero downside.
- **`/movie/[id]` → do not decide blind.** It is the highest-traffic route and
  the reason ISR exists here. Check Cloudflare analytics for its real request
  volume and cache-hit ratio first, then choose between A and B+C. My instinct
  is **B + C**: keep ISR for the money page, add a lifecycle rule so junk
  cannot accumulate, and reject impossible ids cheaply. But that is a judgement
  that should be made against a number, not an instinct.

---

## 2. Redirect system architecture

### The shape, given §0

**Redirects belong in the page layer, on the not-found path — not in
middleware.** The reasoning is simple: *a redirect only ever matters for a URL
that would otherwise 404.* Every real request should therefore pay **nothing**
for the redirect system's existence.

```
request → route matches → entity found?  ── yes ──→ render (redirect system never runs)
                                │
                                no
                                ↓
                      one cached redirect lookup
                                │
                    ┌───────────┴───────────┐
                  found                  not found
                    ↓                        ↓
            permanentRedirect(to)        notFound()
              → real 308                  → real 404
```

This satisfies every constraint you set:

| Requirement | How |
| --- | --- |
| Real 301/308 responses | Proven: 308 in the Worker once the loading boundary is fixed (§0) |
| Works with Cloudflare/OpenNext | It is ordinary Next routing — no adapter feature involved |
| **No database/network lookups in middleware** | **Middleware is not touched at all** |
| No performance problems | Zero cost on the happy path; the lookup runs only on requests already headed for a 404 |
| Dashboard-manageable | Ordinary Supabase table, ordinary draft/publish/audit contract |
| No chains or loops | Prevented at **save** time, not at request time — see below |

### Why not the alternatives

- **Middleware + database read** — violates your constraint outright, and puts a
  failure mode on every request on the site.
- **Middleware + in-isolate cached map** — one network read per isolate, so it
  technically "amortises". But it adds a silent failure mode (a failed read
  means redirects quietly stop working) to the one file where the whole site
  lives. Not worth it.
- **Build-time generated static map** — genuinely the safest mechanism, but it
  needs a deploy per change, which defeats the entire point of the dashboard.
- **Cloudflare Bulk Redirects** — worth checking, and the answer is no: the Free
  plan is capped at **20 items** in practice despite the documented 10,000
  ([Cloudflare Community](https://community.cloudflare.com/t/free-plan-bulk-redirects-still-capped-at-20-items-feb-2025-rollout-to-10-000-neve/936482)).
  It is also managed outside your dashboard, which puts it out of scope.

### The lookup, and why it cannot be sprayed

The same pattern `app/[slug]/page.tsx` already uses for `publishedSlugs()`:
**one query, one cache key, no matter what garbage path is requested.**

```ts
const redirectMap = cache(async (): Promise<Map<string, Rule>> => {
  const sb = supabasePublic(PUBLIC_TTL.stable, ["cms:redirects"]);
  const { data } = await sb.from("redirects").select("from_path,to_path,status").eq("enabled", true);
  return new Map((data ?? []).map(r => [r.from_path, r]));
});
```

Never query per-path: a per-path query embeds the attacker-controlled string in
the fetch URL, and **every unique URL is a fresh data-cache write** — the same
trap documented in `app/[slug]/page.tsx`. One fixed query URL, tagged
`cms:redirects`, so Publish refreshes it immediately through the existing
surgical revalidation layer. `planFor({kind:"redirect"})` returns the tag and
**no route rebuilds**.

### Scope for v1 — say the limit out loud

This design covers **a URL that matches a route but no entity**: a renamed blog
slug, a renamed page, a retired free-movie. That is the gap you actually have —
renaming a page slug today breaks every link with no code-free fix.

It does **not** cover a path that matches no route at all (`/old-section/foo`).
Those never reach a page component. Handling them needs middleware or a
catch-all, and neither is worth its risk for a case that has not come up. If it
does come up, the two hardcoded rules in `next.config.mjs` remain the right
tool. **The dashboard should say this plainly** rather than accepting a rule it
will silently not apply — a redirect you believe in but that does not fire is
worse than no redirect at all.

### Database structure

```sql
create table if not exists redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text        not null unique,       -- normalised: leading "/", no query, no host
  to_path     text        not null,              -- internal path only in v1
  status      smallint    not null default 308,  -- 301 | 308
  enabled     boolean     not null default true,
  note        text,                              -- "renamed when we split the guides"
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists redirects_enabled_idx on redirects (enabled);
```

Additive, idempotent, no existing data touched — same rules as the other six
SQL files. Every change writes an `audit_log` row (module `redirect`, actions
`create` / `update` / `delete`, before/after snapshot), like every other module.

### Limits — this is where the safety actually lives

Every one of these is enforced **server-side at save time**, so a bad rule can
never reach a request:

1. **Exact match only.** No wildcards, no regex, no patterns. A bad pattern here
   can take the whole site down; there is no version of that risk worth taking
   for the convenience.
2. **Hard cap: 500 enabled rules.** The whole set loads as one cached query, so
   the payload must be bounded. Rejected at save with a clear message.
3. **`from_path` validation.** Must start with `/`, must not start with `//`,
   no scheme, no `..`, no query string, ≤ 512 characters.
4. **`to_path` must be internal** in v1. An external redirect hands your traffic
   and your ranking to someone else's domain; that needs a deliberate decision,
   not a text field.
5. **Loop detection at save time.** Walk the chain from the new rule; reject if
   it ever returns to `from_path`.
6. **Chain flattening at save time.** If `to_path` is itself the `from_path` of
   another rule, store the *final* destination. This makes "one hop, always" a
   property of the data, not something the request path has to compute. If a
   later edit would create a chain, existing rules are re-flattened in the same
   transaction.
7. **Shadow check.** If `from_path` resolves to a live page, warn loudly — a
   redirect that shadows real content is how a working page disappears.
8. **Auto-offer on rename.** When a blog post or page slug changes in the
   editor, offer the redirect pre-filled, with a confirmation. This is the
   feature; everything else is plumbing.
9. **Fail open.** If the redirect lookup throws, `notFound()` as before. A
   broken redirect table must never turn into a broken site.

---

## 3. SEO control architecture

The governing principle: **the dashboard should control *what*, and code should
control *how*.** Anything where a wrong value silently removes pages from Google
either stays in code or ships with a confirmation and an audit trail.

| Control | Should it exist? | Source of truth | Dashboard-editable | Stays in code |
| --- | --- | --- | --- | --- |
| **Per-page `noindex`** | **Yes** | `blog_posts.noindex`, `pages.noindex` (new boolean columns) | Per-post / per-page toggle, with a plain-language warning | The route-level posture — `/person` `noindex,follow`, `/admin`, `/search`, `/links`. A toggle that can un-noindex `/admin` should not exist. |
| **Canonical override** | **Yes, carefully** | `blog_posts.canonical_url`, `pages.canonical_url` | Per-page, blank = automatic | The default canonical for every route. Override needs a confirmation: pointing a page elsewhere removes it from the index. Must **merge** with the layout's `alternates`, never replace — both `/movie/[id]` and `/blog/[slug]` carry comments about silently losing the RSS link this way. |
| **Sitemap inclusion** | **Yes, as toggles only** | `site_seo_config.live_config` (configuration-manager pattern) | Per-section on/off: blog, pages, channels, free-movies, genres, `/discover`, the TMDB block | **The sitemap stays generated.** Toggles decide what is *included*; they never become a stored list of URLs. A hand-maintained sitemap drifts from reality the moment anything publishes. Also code-controlled: the 150-URL TMDB cap and the `lastModified` discipline — both were added after real incidents. |
| **Redirects** | **Yes** | `redirects` table (§2) | Full CRUD within the limits above | The two hardcoded rules in `next.config.mjs`, and the "matched route only" scope boundary |
| **Per-page SEO fields** | **Yes — partly exists** | `blog_posts` / `pages` columns | `meta_title`, `meta_description` (already shipped), plus OG image and focus keyword | Title templates, the `%s — Brand` suffix, OG defaults, and every JSON-LD block |
| **robots.txt** | **No** | `app/robots.ts` | Nothing | All of it. It is 15 lines that encode several expensive lessons — the scraper blocklist, the `/_next/image` rule (85k hits in one day), the AI-crawler groups, and the rule that a bot matching a specific group ignores `*` entirely. A dashboard editor here can take the whole site out of Google with one character. If it ever becomes a screen, it should be **read-only, with an explanation**. |
| **TTLs / revalidate tiers** | **No** | `lib/supabase/public.ts`, route `revalidate` exports | Nothing | All of it. Stage 6 nearly broke `/discover` by moving one config read to the wrong tier — 48× more R2 writes from a one-line change. This must never be a text field. |
| **Global title / description** | **Already shipped** | `site_settings` | Yes, draft → publish → rollback | — |

Two things worth adding that are not on your list:

- **An SEO health panel** on the existing System Health screen: pages that are
  `noindex`, pages with a canonical override, redirect count against the cap,
  and how many sitemap URLs are being submitted. Read-only. The value of these
  controls is being able to see what is currently switched on without opening
  seven screens.
- **A "why is this page not indexed" explainer** — given a URL, say which rule
  applies: route-level noindex, per-page toggle, robots.txt, or a redirect.
  Cheap to build once the rules are consolidated, and it is the question you
  will actually be asking in six months.

---

## 4. Recommended implementation order

Ordered by **risk removed per unit of risk added**, with rollback in mind.

### 4B-1 · Soft 404 — the loading boundaries
Code only. No database, no dashboard, no cache change.
**Google impact:** Soft 404 reports stop; crawl budget stops being spent
re-fetching invented ids. **R2:** none directly. **Risk:** low, and it is
visual — the failure mode is a missing skeleton, which you would see
immediately. **Rollback:** restore a file. **Why first:** it unblocks 4B-3 and
it is the cheapest correct thing on the list.

### 4B-2 · R2 junk-object containment
`force-dynamic` on `/blog/[slug]` and `/free-movies/[slug]`. `/movie/[id]`
decided against real traffic numbers first.
**R2:** removes an unbounded write vector — the biggest cost risk on the site.
**Google impact:** none; Googlebot gets identical HTML either way, as the
`/person` comment already documents. **Risk:** low for the two small routes;
**do not touch `/movie/[id]` on instinct.** **Rollback:** one line per route.

### 4B-3 · Redirect Manager
Table, cached lookup, save-time validation, dashboard screen, auto-offer on
slug rename.
**Why third:** it depends on 4B-1 for real 308s, and on 4B-2 so the not-found
path is not itself minting R2 objects. **Risk:** medium — but far lower than
the middleware design 4A pointed at, because nothing runs on the happy path.
**Rollback:** disable every rule from the dashboard; no deploy needed.
**Before any code:** the full design decision / database change / risk
assessment / performance impact / testing plan write-up, as agreed.

### 4B-4 · Per-page SEO fields
`noindex` toggle, canonical override, OG image, focus keyword — Blog and Pages.
Additive columns on existing tables. **Risk:** low mechanically, but the
canonical override is the single most dangerous field in the whole dashboard;
it ships with a confirmation and an audit entry. **Rollback:** clear the field.

### 4B-5 · Global SEO settings
Sitemap section toggles and the SEO health panel, on the configuration-manager
pattern. **Risk:** low. **Rollback:** the existing rollback-to-revision flow.

### 4B-6 · Full regression audit, then the first deploy
Every route's status code, every sitemap URL, every redirect, every tier, the
predeploy gate, and the six SQL files run against the real Supabase.

### Explicitly deferred

- **`rel="nofollow"` on cast links.** Only if crawl volume is still wrong after
  the person `noindex` has had time to take effect. Changing two things at once
  means learning nothing from either.
- **The `/search` `SearchAction`** — a five-minute call once you decide which
  way `/search` should go.
- **Redirects for paths matching no route** — until there is a real case.

---

## 5. Risks, honestly

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Removing `loading.tsx` makes navigation feel slower | Medium | Move `<Suspense>` into the page rather than deleting it; the skeleton survives where it matters |
| `force-dynamic` on `/movie/[id]` increases Worker cost | Medium | **Do not do it without checking traffic first.** Prefer lifecycle + id bounds for that route |
| A bad redirect rule breaks a working URL | Low | Exact match only, shadow check, save-time validation, instant disable from the dashboard |
| Redirect table grows until the cached query is heavy | Low | 500-rule cap, enforced at save |
| A canonical override silently de-indexes a page | Medium | Confirmation, audit entry, and the SEO health panel listing every override |
| Person `noindex` drops traffic | Low | Those pages send almost nothing; `follow` keeps the link value flowing to `/movie/*` |
| The person `noindex` takes months to clear the index | **High** | Expected and unavoidable. Do not judge it in week one, and do not "help" by adding a robots.txt block — that would freeze the URLs in the index permanently |
| Someone later re-adds a `loading.tsx` and quietly reintroduces the soft 404 | Medium | A test asserting the status of a known-bad URL per route, in the 4B-1 work |

---

## 6. What I need from you

1. **Approve the order** — 4B-1 → 4B-2 → 4B-3 → 4B-4 → 4B-5 → 4B-6.
2. **`/movie/[id]`:** can you check Cloudflare analytics for its request volume
   and cache-hit ratio? That is the one decision I do not want to make blind.
3. **Confirm the redirect scope boundary** — v1 covers renamed slugs on
   existing routes, not arbitrary legacy paths. If you have old URLs from a
   previous site structure that need to keep working, tell me now, because that
   changes the design.

---

*No code changed. Every experiment reverted; the tree is at the approved Phase
4A state and the predeploy gate is green. Awaiting approval before 4B-1.*
