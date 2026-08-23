# CMS Cache Layer — Architecture Safety Audit

**Date:** 21 August 2026 · **LOCAL ONLY — not deployed**
**Verdict:** safe as built. Two small gaps found and fixed (§5). No other
implementation change made.

**Accurate framing, used everywhere from now on:**
> Existing Phase 1 R2/OpenNext cache architecture is preserved; a filtered
> CMS-only D1 tag invalidation layer was added.

---

## 1. Exact files changed

### `open-next.config.ts`
Four override keys are set. **Only `tagCache` is new.**

| Key | State |
| --- | --- |
| `incrementalCache` | unchanged — `withRegionalCache(r2IncrementalCache, { mode: "long-lived", shouldLazilyUpdateOnCacheHit: false })` |
| `enableCacheInterception` | unchanged — **`false`** |
| `queue` | unchanged — `queueCache(doQueue, { regionalCacheTtlSec: 5 })` |
| `tagCache` | **NEW** — `withFilter({ tagCache: d1NextTagCache, filterFn: isCmsTag })` |

Plus three imports (`d1-next-tag-cache`, `tag-cache-filter`, `isCmsTag`) and
comments. `cdnInvalidation` appears **only in a comment** explaining why it is
deliberately NOT enabled — it is not a set key.

### `wrangler.jsonc`
One added block; nothing removed or edited.

```jsonc
"d1_databases": [{ "binding": "NEXT_TAG_CACHE_D1",
                   "database_name": "cinetonight-tags",
                   "database_id": "REPLACE_WITH_D1_DATABASE_ID" }]
```

`r2_buckets`, `services`, `durable_objects`, `migrations`, `assets`,
`compatibility_date`/`flags` — all untouched.

### Other cache config
**`next.config.mjs` was not modified.** Every `Cache-Control` / `s-maxage`
header, every TTL and every route rule is exactly as before. No other
cache-override or config file exists in the repo.

### New application files (not config)
`lib/revalidatePlan.ts` (pure planner + tag filter), `lib/revalidateCms.ts`
(executor). Both are ordinary app code, reachable only from `/api/admin/**`.

---

## 2. Containment of the D1 tag cache

**Queried only for CMS tags — yes.** `withFilter` wraps every method
(`getLastRevalidated`, `hasBeenRevalidated`, `isStale`, `writeTags`). A tag
failing `isCmsTag` is dropped *before* any D1 call; when nothing survives the
filter the wrapper returns the "not revalidated" answer without touching D1.

```
CMS_TAG_PATTERN = /^(cms:|_N_T_\/$|_N_T_\/blog(\/|$))/
```

**Cannot affect movie/person/genre/browse routes — yes.** Their tags
(`_N_T_/movie/…`, `_N_T_/person/…`, `_N_T_/genres`, `_N_T_/trending`, …) do not
match, so those routes never query D1 and never receive an invalidation. Two
tests assert both directions, and a third asserts no plan can ever contain such
a path. Runtime evidence: `/free-movies` stayed `x-nextjs-cache: HIT` across a
publish.

Even in the impossible case of a filter bug, the blast radius is bounded by
`planFor()`, which can only ever emit `/blog/<slug>`, `/blog` and `/`.

**Cannot create unbounded rows — correct, with one caveat (§3).** Tags come
from CMS slugs, which are `slugify()`d server-side (`a–z0–9-`, ≤80 chars) and
created only by an authenticated admin. No visitor-controlled URL becomes a
row. This is the key difference from the old `/person/*` R2 blow-up, where the
id space was unbounded and public.

**Row-growth model.** The table is
`revalidations (tag, revalidatedAt, stale, expire, UNIQUE(tag) ON CONFLICT REPLACE)`.
Re-publishing the same post **replaces** its row. Row count is therefore a
function of *distinct content*, not of *publishing frequency*.

**Cost.** Reads: one row per cached read of `/`, `/blog`, `/blog/*`, memoised
per request. At ~17k page views/day site-wide, a few thousand D1 reads/day
against a 5M/day free allowance. Writes: ≤5 per publish. Storage: kilobytes.
Negligible.

---

## 3. Worst-case row counts

Constants: `_N_T_/`, `_N_T_/blog`, `cms:blog` — **3 shared rows**, written once
and replaced thereafter. Each distinct post adds 2: `_N_T_/blog/<slug>` and
`cms:blog:<slug>`.

| Scenario | Rows |
| --- | --- |
| 1 publish | **≤ 5** (3 shared + 2 for that post) |
| 100 publishes of the **same** post | **5** — rows are replaced, not appended |
| 100 publishes of 100 distinct posts | 3 + 200 = **203** |
| 1,000 publishes of 1,000 distinct posts | 3 + 2,000 = **2,003** |
| plus pages | `cms:pages` + 1 per distinct page |

**Old rows are reused, not accumulated** — `UNIQUE(tag) ON CONFLICT REPLACE`.
Publishing forever does not grow the table; only *new slugs* do.

### The one caveat: build-id namespacing

OpenNext keys rows as `<OPEN_NEXT_BUILD_ID>/<tag>`. **Every deploy starts a new
namespace, and the previous deploy's rows are never read again but are never
deleted either.** So the table grows by roughly (rows in use) per deploy.

Sizing: ~2,000 rows × ~30 deploys ≈ 60,000 rows ≈ well under 10 MB, against a
5 GB free limit. Harmless, but not self-cleaning. **Recommended housekeeping**
— occasionally, or after a big deploy run:

```
npx wrangler d1 execute cinetonight-tags --remote \
  --command "DELETE FROM revalidations WHERE tag NOT LIKE '<current-build-id>/%';"
```

I did **not** automate this: a scheduled delete against the tag store is more
moving parts than a few megabytes justifies. Flagged rather than silently left.

---

## 4. Cloudflare single-file purge

| Question | Answer |
| --- | --- |
| Only after explicit Publish/Update/Trash? | **Yes.** `purgeUrls()` is called only from `runPlan()`, only from `revalidateForAction()`, and only from the create / save / trash / restore / permanent-delete branches. |
| Never on autosave? | **Yes.** Autosave and discard-draft return before any revalidation code, produce `EMPTY_PLAN`, and are enforced by a source-level test that fails if those branches ever mention `purgeUrls`, `runPlan`, `revalidateTag`, `revalidatePath` or `revalidateForAction`. |
| Max URLs per action | **3** (`/blog/<slug>`, `/blog`, `/`). Pages purge **0**. Hard-capped at `urls.slice(0, 30)`, the API's limit. |
| Arbitrary user-supplied URLs? | **No.** URLs are `baseUrl()` (a server env var) + a server-side `slugify()`d slug — `a–z0–9-`, ≤80 chars. Nothing from the request body reaches the URL unfiltered. No wildcards, prefixes, hosts or tags: the body is `{ files: [...] }` and a test asserts that is the only key. |
| Token scope | **Yes** — create it as Zone → **Cache Purge → Purge**, scoped to cinetonight.com only. It cannot read R2, D1, Workers, DNS or account settings. Store as Worker **secrets** (`CACHE_PURGE_ZONE_ID`, `CACHE_PURGE_API_TOKEN`), never in `wrangler.jsonc`. |

If `NEXT_PUBLIC_SITE_URL` were unset in production, `baseUrl()` falls back to
localhost and Cloudflare would simply reject the purge — wrong-but-harmless,
and it is already set.

---

## 5. Failure behaviour

**The rule: a successful database write is NEVER reported as a failure because
cache clearing failed.**

| Failure | What happens |
| --- | --- |
| **D1 unavailable / binding missing** | The override reports "disabled" and returns "not revalidated". Site falls back to plain TTL expiry — exactly today's behaviour. Public reads keep working; nothing 500s. |
| **Purge API unreachable / errors / times out** | Caught; capped at a 3-second `AbortController`. Returns `cdn: "failed"`. Save still succeeds. |
| **Purge token missing** | Returns `cdn: "not-configured"`. No request is made. Save still succeeds. |
| **Supabase write succeeded, revalidation failed** | The write is already committed and the response is still `ok: true` with the saved row. |

### Two gaps this audit found — both fixed

1. **`revalidateForAction()` sat inside the route's `try/catch`.** Any
   unexpected throw would have been caught by the route and reported as
   *"Could not save post"* — a lie, since the row was already written. It is
   now internally wrapped and **cannot throw**; on failure it logs and returns
   `{ status: "partial", cdn: "failed" }`.

2. **The confirmation message did not distinguish cache state.** It said only
   "Saved and published." Now the author sees:
   - CDN purged → *"Saved and published. The live page is updated now."*
   - purge not configured or failed → *"Saved and published. Cache refresh is
     catching up — the live page may take a few minutes."*

   The word "published" is never replaced by an error. Implemented once in
   `cacheNote()` (`components/admin/shared.tsx`) and used by both editors.

No other implementation change was made.

---

## 6. Cache interception

**Not interacted with, not re-enabled.**

- `enableCacheInterception: false` is untouched in `open-next.config.ts`.
- `scripts/predeploy-check.mjs` verifies it in the **built worker**: 4/4 pass
  on the current build.
- `tagCache` is an independent key; it does not read or set it.
- OpenNext's `isPurgeCacheEnabled()` reads `cdnInvalidation`, which we do not
  set — so the regional cache's `bypassTagCacheOnCacheHit` /
  `shouldLazilyUpdateOnCacheHit` defaults are also unchanged. This is why the
  built-in purge was skipped in favour of our own URL purge: it keeps the
  regional-cache behaviour bit-for-bit identical to Phase 1.

The Aug 2026 request-loop fix is untouched by everything in this change.

---

## 7. Documentation corrected

The claim *"no cache architecture changed"* was inaccurate and has been removed
from every document. All five now carry:

> Existing Phase 1 R2/OpenNext cache architecture is preserved; a filtered
> CMS-only D1 tag invalidation layer was added on 21 Aug 2026.

Updated: `CMS-STAGE2-BLOG.md`, `CMS-STAGE3-LINKS.md`, `CMS-STAGE4-PAGES.md`,
`CMS-REVALIDATION.md`, `DASHBOARD-REVIEW-AND-TEST.md`.

---

## 8. Status

`tsc` clean · `npm test` **96 / 96** · Stage 5 **not started** · nothing
deployed. Outstanding before this layer can work in production: create the D1
database and paste its id into `wrangler.jsonc`; optionally add the two purge
secrets. Until then the tag cache disables itself and the site behaves exactly
as it does today.
