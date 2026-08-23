# Surgical revalidation after Publish / Update

**Date:** 21 August 2026 · **LOCAL ONLY — not deployed**
Verified: `tsc` clean · `npm test` **96/96** · `opennextjs-cloudflare build` OK ·
`predeploy-check` **4/4** · tested in the real worker runtime (`wrangler dev`)
with a local D1, not just `next dev`.

---

## 1. Exact revalidation mechanism

Three layers had to be cleared. All three are cleared by path/tag, never in bulk.

| Layer | What was stale | Mechanism now |
| --- | --- | --- |
| **Data cache** (Supabase reads) | up to 30 min (blog) / 24 h (pages) | `revalidateTag("cms:…", { expire: 0 })` |
| **Route cache** (ISR page in R2) | up to 30 min | `revalidatePath("/blog/<slug>")` + `revalidateTag("_N_T_/blog/<slug>", { expire: 0 })` |
| **CDN edge cache** (`s-maxage=3600` on `/blog/*`) | up to 1 h | Cloudflare **single-file purge** — `POST /zones/{zone}/purge_cache` with `{"files":[…exact URLs…]}` |

**The enabling change.** `revalidateTag` / `revalidatePath` were silent no-ops
on Cloudflare because OpenNext had no tag store. One was added:

```ts
tagCache: withFilter({ tagCache: d1NextTagCache, filterFn: isCmsTag })
```

- **D1**, binding `NEXT_TAG_CACHE_D1`. It records "tag X expired at T". It does
  not store pages and does not rewrite anything.
- **Filtered.** The store is only ever consulted for the tags this project
  revalidates: `cms:*`, `_N_T_/`, `_N_T_/blog`, `_N_T_/blog/*`. Movie pages,
  person pages, genres, browse pages — the entire long tail — never query D1
  and behave exactly as before.
- **Fails safe.** No binding → the override disables itself → plain TTL expiry,
  i.e. today's behaviour.

**`{ expire: 0 }` matters.** Next 16's default opens a stale-while-revalidate
window, which would still hand the *first* visitor after a publish the old
copy. Expiring outright means the next request renders the persisted version.

**Why not OpenNext's built-in `cdnInvalidation`:** it purges by Cloudflare
*cache tags*, which are Enterprise-only. On this plan every revalidation would
fire a failing API call. Single-file purge works on the Free plan.

**Tagging the reads.** `supabasePublic(ttl, tags?)` now accepts optional tags.
TTL values are unchanged; an untagged read behaves exactly as before.

| Read | Tags |
| --- | --- |
| `getBlogs()` | `cms:blog` |
| `getBlog(slug)` | `cms:blog`, `cms:blog:<slug>` |
| page slug list | `cms:pages` |
| `getPage(slug)` | `cms:pages`, `cms:page:<slug>` |

---

## 2. What each admin action invalidates

Decided by one pure, tested function: `lib/revalidatePlan.ts` → `planFor()`.

| Action | Tags | Paths | CDN URLs |
| --- | --- | --- | --- |
| **Blog publish / update** (live) | `cms:blog`, `cms:blog:<slug>` | `/blog/<slug>`, `/blog`, `/`¹ | the same, absolute |
| **Blog trash / unpublish** (was live) | `cms:blog`, `cms:blog:<slug>` | `/blog/<slug>`, `/blog`, `/`¹ | the same |
| **Blog delete forever** (was live) | same | same | same |
| **Blog: draft → draft** | — | — | — |
| **Page publish / update / trash** | `cms:pages`, `cms:page:<slug>` | none² | none³ |
| **Page address changed** | both old and new page tags | none | none |
| **Autosave** | — | — | — |
| **Discard draft** | — | — | — |

¹ `/` **only if the Guides strip is affected.** The homepage shows the newest
**3** guides. The live list is captured before *and* after the write, and `/`
is revalidated only if the post is in the top 3 in either — so a post dropping
out is caught, and an old archive post never rebuilds the homepage.

² `/[slug]` is `force-dynamic`: it renders per request and has no route-cache
entry. Invalidating its cached reads is the complete fix.

³ No `s-maxage` header matches root-level page addresses, so there is nothing
at the edge to purge.

**Deliberately NOT invalidated:** movie pages, genre pages, listing pages.
They each show a 3-item Guides teaser on the 6-hour tier. There are hundreds of
those routes — revalidating them is precisely the "large R2 regeneration" the
brief forbids, and a few hours of staleness on a teaser is invisible.

---

## 3. Proof that autosave invalidates nothing

Four independent guards:

1. **Different column.** Autosave writes `draft_body` / `draft_content`. The
   public site reads `body` / `content`. It is not possible for an autosave to
   change a published page.
2. **Empty plan, by construction.** `planFor({kind:"none"})` returns
   `EMPTY_PLAN`. A unit test asserts all three arrays are length 0.
3. **Source-level guard** (`tests/autosaveNeverPublishes.test.mjs`): reads the
   actual route files, isolates the autosave branch, and fails if it ever
   contains `revalidateForAction`, `revalidateBlog`, `runPlan`,
   `revalidatePath`, `revalidateTag` or `purgeUrls` — or writes any public
   column. Same guard on `discardDraft`. This is what stops a future edit from
   quietly reintroducing the risk.
4. **Visible in the response.** Both autosave branches return
   `revalidated: null`, so the contract is observable, not assumed.

The extra "is this in the Guides strip?" query is also skipped for autosave —
it costs nothing.

---

## 4. R2 / cache impact

**Per publish of a live post:** at most **3** route regenerations
(`/blog/<slug>`, `/blog`, and `/` only when the strip changes) = at most **3**
Class A writes, plus a handful for the re-read Supabase queries. Regeneration is
**lazy** — it happens on the next request for that route, and the existing
Durable Object queue de-duplicates it globally, so it stays one rebuild no
matter how many Cloudflare locations notice.

These are writes that would have happened anyway when the TTL expired. The
change is *when*, not *how many*.

**Per publish of a draft: zero.**

**Steady-state read cost:** one D1 row read per cached read of `/`, `/blog` or
`/blog/*` (memoised per request). Every other route is unaffected. At this
site's traffic that is a few thousand rows a day against D1's free 5M/day.

**Unchanged:** R2 key layout, all TTL values, `enableCacheInterception`
(**still `false`**, verified in the built worker), the R2 incremental cache
override, the regional cache, and the DO revalidation queue.

**Runtime evidence** (`wrangler dev`, real worker, local D1):

```
warm  /free-movies              x-nextjs-cache: HIT
warm  /blog/<slug>              x-nextjs-cache: HIT
--- publish ---
D1 rows written: 5  (_N_T_/, _N_T_/blog, _N_T_/blog/<slug>, cms:blog, cms:blog:<slug>)
      /blog/<slug>              x-nextjs-cache: MISS   ← regenerated
      /free-movies              x-nextjs-cache: HIT    ← untouched
      /blog/<slug>  (again)     x-nextjs-cache: HIT    ← one rebuild, not many
```

D1 held **0** rows before the publish. No movie, person, genre or browse tag
was written.

---

## 5. Tests

**96 / 96 pass** (30 new in this change).

| File | Covers |
| --- | --- |
| `tests/revalidatePlan.test.mjs` | plan for every action; homepage only when the strip changes; exact absolute URLs, no wildcards; nothing ever touches a movie/person/genre/browse route; ≤3 routes per plan; the tag filter accepts our tags and rejects everything else |
| `tests/autosaveNeverPublishes.test.mjs` | the source-level guards in §3, plus: purge body contains only `files`, is capped at 30, and is time-boxed |
| `tests/scrollLock.test.mjs` | the sidebar bug — see §6 |

Also run: `npx tsc --noEmit` clean · `npx opennextjs-cloudflare build` OK ·
`scripts/predeploy-check.mjs` 4/4 · admin JS still absent from public bundles.

---

## 6. Sidebar scroll-lock — fixed and now regression-tested

The fix was already in place; it had no test, so it could silently regress.
The counting logic was extracted to `lib/scrollLock.ts` (no React, no DOM) and
`tests/scrollLock.test.mjs` now covers the two original defects and the ways a
naive fix breaks something else:

- one overlay locks then **restores** the page;
- the **previous** overflow value comes back, it is not blanked;
- overlapping overlays never unlock each other (modal closes, drawer still open → stays locked);
- a stray release cannot unlock the page or drive the count negative;
- a second open/close cycle behaves like the first;
- `acquire` is **not** idempotent — every overlay must be counted.

`components/Header.tsx` still toggles by viewport (drawer below 760px, rail
above), which was the root cause: it used to set `open = true` unconditionally,
React bailed out, cleanup never ran, and the page stayed locked.

---

## 7. What you must do before this can work in production

1. `npx wrangler d1 create cinetonight-tags`
2. Paste the returned id into `wrangler.jsonc` → `database_id`
   (currently the placeholder `REPLACE_WITH_D1_DATABASE_ID`).
3. The table is created by `npx opennextjs-cloudflare populateCache`, part of
   the normal build. The manual SQL is in the `wrangler.jsonc` comment.
4. **Optional but recommended** — instant edge clearing. Create a Cloudflare
   API token with **Zone → Cache Purge → Purge**, scoped to cinetonight.com
   only, and set two Worker secrets:
   `CACHE_PURGE_ZONE_ID`, `CACHE_PURGE_API_TOKEN`.
   Without them everything else still works; the dashboard says so plainly and
   the edge copy expires on its normal schedule.

Until step 1 is done the tag cache disables itself and the site behaves exactly
as it does today — nothing breaks by deploying before it.

---

*Nothing here has been deployed. `enableCacheInterception` remains `false`.
**Existing Phase 1 R2/OpenNext cache architecture is preserved; a filtered
CMS-only D1 tag invalidation layer was added.** No TTL, R2 key,
incremental-cache, regional-cache or queue setting changed.
See docs/CMS-CACHE-LAYER-AUDIT.md for the safety review of that new layer.*
