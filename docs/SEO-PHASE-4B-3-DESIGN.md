# 4B-3 — Redirect Manager: design

**Date:** 22 August 2026 · **DESIGN ONLY — no code, no schema applied.**
Awaiting approval before implementation.

---

## 1. Design decision

**Redirects resolve in the page layer, on the not-found path. Middleware is
not touched.**

The reasoning is one sentence: *a redirect only ever matters for a URL that
would otherwise 404.* Every real request should therefore pay nothing for the
redirect system existing.

```
request → route matches → entity found? ── yes ──→ render      (redirect system never runs)
                                │
                                no
                                ↓
                   one cached redirect-map read
                                │
                    ┌───────────┴───────────┐
                  found                  not found
                    ↓                        ↓
          permanentRedirect(to)          notFound()
             → real 308                   → real 404
```

This is only possible because of 4B-1. Before that, an in-render redirect
returned HTTP 200 with a client-side payload on this stack; with the Suspense
boundaries moved, it emits a real 308 — measured in the Worker, and the person
route proves it in production today.

### Against your eight requirements

| # | Requirement | How this meets it |
| --- | --- | --- |
| 1 | Old URL → new URL | Exact-match table, resolved before `notFound()` |
| 2 | One hop, no chains | **Flattened at save time** — chains are impossible in the stored data, not merely avoided at request time |
| 3 | Dashboard management | Standard module: list, create, edit, disable, delete, search |
| 4 | Audit everything | One `audit_log` row per create/update/delete/enable/disable, with before/after |
| 5 | Preview before publishing | Rules are created **disabled**. A URL tester shows the resolution, then you enable |
| 6 | Bulk import | CSV paste → dry-run report → apply. Every row validated individually |
| 7 | **No database query in middleware per request** | **Middleware is not involved at all** |
| 8 | Cache-safe | One cached query tagged `cms:redirects`; publishing clears that tag and rebuilds **no routes** |

### Rejected alternatives

- **Middleware + per-request DB read** — violates requirement 7 outright, and
  puts a failure mode on every request on the site.
- **Middleware + isolate-cached map** — technically satisfies "not per
  request", but adds a silent failure mode (a failed read means redirects
  quietly stop) to the one file the whole site passes through. Not worth it for
  a feature that only fires on 404s.
- **Cloudflare Bulk Redirects** — Free plan caps at 20 items in practice, and
  it is managed outside your dashboard.
- **`next.config.mjs` only** — a real 308, but needs a deploy per change, which
  defeats the point.

---

## 2. Scope, stated honestly

**Covered: any path that matches a route but no entity.** That is:

| Route | Example | Covered |
| --- | --- | --- |
| `/blog/[slug]` | `/blog/old-post` | ✅ |
| `/[slug]` (root catch-all) | `/contact-us` | ✅ |
| `/free-movies/[slug]` | `/free-movies/old-film` | ✅ |
| `/channel/[slug]` | `/channel/old-name` | ✅ |
| `/movie/[id]` | `/movie/old-id` | ✅ (see §7) |

**Both of your migrations are in this set.** `/blog/what-to-watch-this-weekend-august-21-23-2026`
matches `/blog/[slug]`; `/contact-us` matches the root catch-all.

**Not covered: a path matching no route at all** — `/old-section/foo/bar`,
`/2024/07/some-post`. Those 404 at the routing layer and never reach a page.

This matters for requirement 6. A bulk import from a *previous site structure*
would likely contain such paths. **The dashboard must refuse to pretend**: on
import, any row whose `from_path` cannot match a route is flagged
**"needs deploy"** rather than silently accepted. A redirect you believe in but
that never fires is worse than no redirect.

### Tier 2, designed but not built

For arbitrary legacy paths: a build step reads the same table and emits a
static map into `next.config.mjs`'s `redirects()`. Real 308, resolved before
any rendering, zero runtime cost. **Costs a deploy per change** — acceptable,
because arbitrary-path migrations happen once, not weekly.

The database stays the single source of truth either way. The dashboard shows
*"3 rules waiting for the next deploy"* so the state is never a mystery.

**Recommendation: ship Tier 1 only. Build Tier 2 when a real migration needs
it.** The schema below supports both from day one, so it is a drop-in.

---

## 3. Database changes

```sql
create table if not exists redirects (
  id           uuid primary key default gen_random_uuid(),
  from_path    text        not null unique,      -- normalised: leading "/", no query, no host
  to_path      text        not null,             -- internal path only in v1
  status       smallint    not null default 308, -- 301 | 302 | 307 | 308
  enabled      boolean     not null default false, -- created OFF: preview, then enable
  tier         text        not null default 'route',  -- 'route' | 'deploy'  (see §2)
  note         text,                             -- "merged the weekend roundups"
  hits         integer     not null default 0,   -- optional, see §8
  last_hit_at  timestamptz,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists redirects_enabled_idx on redirects (enabled);
```

Additive, idempotent, no existing data touched — same rules as the other eight
files. Ships as `supabase/redirects.sql`.

**`enabled` defaults to FALSE.** That is requirement 5 in the schema rather
than in the UI: a rule cannot affect the live site until someone has looked at
it. It is also the safety property that makes a bad bulk import harmless.

**No `draft_config` / `live_config` here.** Unlike Homepage or Discovery, a
redirect is not one document with a draft — it is a set of independent rows,
each with its own on/off. `enabled` is the draft/live boundary, per row.

---

## 4. How a request resolves

One shared helper, used by every route that can 404:

```
redirectOrNotFound(path)
  → look up path in the cached map
  → hit and enabled? permanentRedirect(to_path, status)
  → otherwise notFound()
```

### The lookup, and why it cannot be sprayed

**One query, one cache key, whatever garbage path is requested:**

- `select from_path, to_path, status from redirects where enabled = true`
- Read through `supabasePublic(PUBLIC_TTL.stable, ["cms:redirects"])`
- Built into a `Map` inside React `cache()`, so one render = one lookup

**Never query per-path.** A per-path query embeds the attacker-controlled
string in the fetch URL, and every unique fetch URL is a fresh data-cache
write — the same trap `app/[slug]/page.tsx` already documents for
`publishedSlugs()`. One fixed query URL, always.

### Cache safety (requirement 8)

- Publishing a rule → `planFor({ kind: "redirect" })` returns the tag
  `cms:redirects` and **no paths**. No route rebuilds, no bulk R2 writes.
- The map read sits on the **`stable` (24h)** tier. It must **not** go on a
  shorter tier: Next takes the *minimum* of a route's revalidate and every
  fetch inside it, so a 30-minute read here would drag `/blog/[slug]` down from
  30 minutes to 30 minutes (fine) but `/free-movies/[slug]` from a day to 30
  minutes — 48× more R2 writes. That exact regression happened in Stage 6.
- The tag makes a publish appear immediately; the TTL is only the quiet-period
  fallback.

### Permanent redirects and browser caching — a real hazard

A 301/308 is cached **by the browser, sometimes indefinitely**. Delete the rule
and returning visitors keep being redirected. This is the most common way a
redirect mistake becomes unfixable.

Three mitigations, all in the design:

1. **Rules are created as 307 (temporary)** and promoted to 308 by an explicit
   action once you have verified the destination.
2. Permanent redirect responses carry an explicit short `Cache-Control`, so a
   mistake ages out of browsers instead of being permanent.
3. The editor states plainly, next to the status selector, that a permanent
   redirect is remembered by browsers and hard to take back.

---

## 5. Limits — where the safety actually lives

Every one enforced **server-side at save time**, so a bad rule can never reach
a request.

1. **Exact match only.** No wildcards, no regex, no patterns. A bad pattern can
   take the whole site down; no convenience is worth that risk.
2. **Cap: 500 enabled rules.** The whole set loads as one cached query, so the
   payload must be bounded. Rejected at save with a clear message.
3. **`from_path` validation.** Leading `/`, not `//`, no scheme, no `..`, no
   query string, ≤ 512 characters, lowercased and trailing-slash-stripped so
   `/Contact-Us/` and `/contact-us` cannot both exist.
4. **`to_path` must be internal** in v1. An external redirect hands your
   traffic and your ranking to another domain — a deliberate decision, not a
   free-text field.
5. **Loop detection.** Walk the chain from the new rule; reject if it ever
   returns to `from_path`.
6. **Chain flattening.** If `to_path` is itself a `from_path`, store the
   *final* destination. A later edit re-flattens every affected rule in the
   same transaction. **This makes "one hop" a property of the data**, so the
   request path never has to compute it — requirement 2, structurally.
7. **Shadow check.** If `from_path` resolves to a live page, refuse and say so.
   A redirect that shadows real content is how a working page disappears.
8. **Self-redirect check.** `from_path === to_path` rejected.
9. **Fail open.** If the lookup throws, `notFound()` exactly as today. A broken
   redirect table must never become a broken site.
10. **Auto-offer on rename.** When a blog or page slug changes in the editor,
    offer the redirect pre-filled, enabled, with a confirmation. *This is the
    feature.* Everything else is plumbing.

---

## 6. Dashboard

**Redirects** in the sidebar, under Internal Links.

- **List** — from, to, status, on/off, hits, last hit. Search and filter.
- **Add** — two fields, a status selector, a note. Saved **disabled**.
- **URL tester (requirement 5)** — type any URL, see exactly what happens:
  *"→ 308 to /contact"*, *"no rule, would 404"*, *"rule exists but is disabled"*,
  *"would shadow a live page — refused"*. Runs against the same resolver the
  request path uses, so it cannot disagree with reality.
- **Bulk import (requirement 6)** — paste CSV `from,to,status`. **Dry run
  first**: a per-row report of valid / invalid / would-shadow / would-loop /
  needs-deploy, with nothing written. Then Apply, which writes every valid row
  **disabled**. Review, then enable in bulk.
- **Delete** — confirmation naming the rule, with the browser-cache warning.
- **Audit (requirement 4)** — every create, update, delete, enable, disable and
  bulk import writes an `audit_log` row with before/after, visible in Activity
  with its own module filter.

---

## 7. Risk assessment

| Risk | Severity | Mitigation |
| --- | --- | --- |
| A rule shadows a live page | **High** | Shadow check refuses it at save; rules start disabled |
| A permanent redirect is cached in browsers after deletion | **High** | Created as 307; explicit `Cache-Control`; promotion is a deliberate act |
| Chain or loop | Medium | Flattened and loop-checked at save — impossible in stored data |
| Bad bulk import | Medium | Dry run, per-row validation, everything lands disabled |
| Table grows until the cached query is heavy | Low | 500-rule cap |
| Lookup fails and redirects stop | Low | Fail open to 404, same as today; the URL tester surfaces it |
| **A redirect on an ISR route gets cached into R2 per old slug** | **Unknown** | **Must be measured before implementation — see below** |
| Someone adds a route that can 404 and forgets the helper | Medium | A test that asserts every `notFound()` call site goes through `redirectOrNotFound` |

### The one thing to measure first

`/blog/[slug]` and `/free-movies/[slug]` are ISR. We know an invented slug
writes an R2 object there. **We do not know whether a redirect response gets
cached the same way.** If it does, it is bounded by the number of rules (≤500),
which is harmless — and arguably good, since a cached redirect is cheap. If it
behaves unexpectedly, the fix is 4B-2 (`force-dynamic` on those routes), which
is already planned.

**This is a 15-minute measurement in `wrangler dev`, and it happens before any
implementation.** I am not guessing at it.

---

## 8. Performance impact

- **Zero on the happy path.** A request for a page that exists never touches
  the redirect system.
- **On a 404:** one cached Supabase read, shared across the whole render and
  across all requests in the TTL window. Effectively one query per 24 hours per
  region, plus one per publish.
- **On a redirect:** a 308 response, a few hundred bytes, versus a full page
  render. Cheaper than what happens today.
- **Middleware:** unchanged. The existing genre rule stays — it is a static Set
  lookup with no database, and it is not part of this system.
- **`hits` counting:** proposed as **off by default.** Incrementing a counter
  on every redirect turns a read-only path into a write path on a URL space
  anyone can spray. If you want hit counts, they should come from Cloudflare
  analytics, not from a database write per request. Listed in the schema so the
  column exists; nothing writes to it in v1.

---

## 9. Testing plan

**Pure unit tests** (`lib/redirects.ts`, no network — the house pattern):

- normalisation: case, trailing slash, query stripping, `..`, `//`, length
- loop detection: direct, two-hop, three-hop, self
- chain flattening: A→B→C stores A→C; adding B→D re-flattens A→D
- **every stored `to_path` is either not a `from_path`, or the rule is
  disabled** — the invariant that makes "one hop" true
- shadow detection against a known live-slug list
- bulk import: valid, malformed, duplicate, looping, shadowing, external rows
- cap enforcement at 500

**Worker tests** (`wrangler dev`, real runtime):

- `/blog/<old>` → **308** → `/blog/<new>`, one hop, verified with `num_redirects`
- disabled rule → **404**, not a redirect
- a live page with a rule pointing at it → still **200** (shadow refused)
- **R2 object count before and after 20 redirect hits** — the §7 measurement
- `/movies?genre=made-up` still 308s (the middleware rule is untouched)

**Regression:**

- every public route's revalidate tier unchanged
- no admin JS in any public bundle
- `predeploy-check` 4/4
- **the sitemap contains no `from_path`** — asserted in a test, because a
  sitemap that submits a redirecting URL is a self-inflicted crawl error

---

## 10. Migration plan A — the weekend roundup

`/blog/what-to-watch-this-weekend-august-21-23-2026` → `/blog/what-to-watch-this-weekend`

**Why:** the date is defensible for a weekend roundup, but publishing one every
Friday means 26 near-identical titles a year, each decaying by Monday and all
competing. One evergreen URL, updated weekly, compounds authority instead of
splitting it. Your CMS already supports this properly — revisions and rollback
mean no version is ever lost.

**Steps, in order:**

1. Open the post, change the slug to `what-to-watch-this-weekend`.
2. The editor offers the redirect, pre-filled, enabled. Accept.
3. Rewrite the intro so it is not anchored to one weekend; keep the dated
   content as the current week's picks.
4. Update the title and meta title to drop the date.
5. **Preview**, then Publish.
6. `revalidateForAction` clears `cms:blog` + `cms:blog:<new-slug>` and rebuilds
   `/blog/<new>`, `/blog`, and `/` if the guides strip changed. The old slug is
   not a route any more — the redirect covers it.
7. The sitemap picks up the new URL automatically and drops the old one, since
   it is generated from the database.
8. **Check Internal Links** for anything still pointing at the old slug and fix
   those to point directly at the new URL. A redirect should be a safety net
   for external links, not a permanent hop your own site relies on.
9. Resubmit the sitemap in Search Console.

**What to expect:** the old URL moves to "Page with redirect" in Search Console
over the following days. Ranking signals consolidate on the new URL. Total
traffic dips briefly, then recovers on one stronger page.

**Rollback:** disable the rule and rename the slug back. Nothing is destroyed;
the post's revision history holds every version.

**Going forward:** each Friday, edit the same post — new picks, new publish
date, same URL. That is the whole point.

---

## 11. Migration plan B — contact-us

`/contact-us` → `/contact` — **pending confirmation that both exist.**

**Confirm first:**

```
curl -s https://cinetonight.com/sitemap.xml | findstr /c:"contact"
```

**If both are published:**

1. Decide which survives. **Recommendation: `/contact`** — shorter, and the
   more searched form.
2. Merge any content only on `/contact-us` into `/contact`.
3. Unpublish `/contact-us` (Trash, not delete — it stays recoverable).
4. Add the redirect `/contact-us` → `/contact`, preview, enable.
5. Update the footer or any nav entry pointing at the old one.
6. Verify: `/contact-us` returns 308, `/contact` returns 200.

**If only one exists,** there is nothing to do — the duplicate is a
misreading of the sitemap, and I would rather find that out than add a rule for
a URL that was never live.

**Note:** Pages still have no per-page SEO fields, so a canonical is not an
option here — the redirect is the tool. That is the unfinished half of 4B-4.

---

## 12. Impact review

**Cloudflare.** A redirect is a cheap Worker response. No R2 write on the
happy path. The one open question is §7's ISR measurement. `enableCacheInterception`
stays `false`. No change to R2, the regional cache, the DO queue or any TTL.

**Next.js routing.** The helper runs *after* route match and *before*
`notFound()`. It never runs for a request that resolves to real content. It
relies on 4B-1's Suspense-boundary fix for a real 308 — so **a `loading.tsx`
must never be reintroduced on a route that hosts a redirect**, and a test will
assert that.

**Sitemap.** Generated from the database, so a renamed slug propagates
automatically. Adding an assertion that no `from_path` appears in the sitemap —
submitting a URL that redirects is a self-inflicted crawl error, and the
weekend migration is exactly the case that would cause it.

**SEO.** A 301/308 passes ranking signals. One hop preserves nearly all of it;
chains leak at every step, which is why flattening is structural here. Expect
old URLs to show as "Page with redirect" in Search Console — that is the
success state, not an error.

---

## 13. Build order, once approved

1. Measure the ISR-redirect R2 behaviour (§7). **Blocks everything else.**
2. `lib/redirects.ts` — pure: normalise, validate, flatten, detect loops. Tests first.
3. `supabase/redirects.sql`.
4. `/api/admin/redirects` — CRUD, bulk import dry-run + apply, all limits, audit.
5. `redirectOrNotFound` helper, wired into `/blog/[slug]` and `/[slug]` only.
6. Dashboard screen with the URL tester.
7. Auto-offer on slug rename in the Blog and Pages editors.
8. Worker verification, then migration A, then migration B.

Steps 1–3 are the ones worth doing carefully. The rest follows.

---

*Design only. No code, no schema applied. Awaiting approval.*
