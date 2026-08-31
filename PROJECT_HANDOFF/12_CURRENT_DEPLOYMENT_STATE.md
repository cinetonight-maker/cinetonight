# 12 — Current deployment state

**As of 31 August 2026.**

## Live production

**Worker version `8682b8f8-4a69-4669-bd0b-14f786a38f59`, deployed 22 August 2026.**
Rollback target: `9cd4711d`. BUILD_ID at that deploy: `kfLuR6I_d-I0IYzTvRIew`.

At that deploy: predeploy 4/4, `tsc` clean, `npm test` 265/265,
`enableCacheInterception` false, all five bindings confirmed, 84 R2 cache
entries populated, Worker startup 30 ms.

## Deployment history

| Date | Event |
| --- | --- |
| 14 Aug | Site live (on Vercel) |
| 15 Aug | Cloudflare migration |
| 20 Aug | `PRE-DEPLOY-AUDIT-2026-08-20.md` — GREEN, **explicitly not deployed** |
| 22 Aug | **Deploy `8682b8f8`** — last real deploy |
| 23 Aug | `ef058fc` + `3827a4c` committed — **never deployed** |
| 26 Aug | Eight further changes built locally, verified, **held for a batch** |
| 31 Aug | Still not deployed |

**Critical habit:** this repo commits **after** deploying. `DEPLOY-2026-08-22.md`
was added in a 23 August commit. **Never infer what is live from git history.**

## Pending batch — built, verified, NOT deployed

Verified 26 August: `tsc --noEmit` clean, OpenNext build succeeded,
`predeploy-check.mjs` **4/4**, BUILD_ID `b1X2ekzPOPajsurS8iIr9`,
`/movie/[id]` still `●` SSG. Tests **286/286**.

1. Where to Watch server-rendered + `offers` schema + 72h TTL pin
2. `MIN_VOTES.year` 1 → 25
3. Big Buck Bunny + picsum removed from the player
4. `app/movie/[id]/loading.tsx` deleted (real 404s)
5. FAQ: "Who runs CineTonight?"
6. Author pages, bylines, `Person` schema, admin picker, sitemap entries
7. Word-boundary meta descriptions across 7 files
8. Dead `merged.sort(() => 0)` removed; picsum out of `next.config.mjs`

**Uncommitted files:** 21 modified, 1 deleted, and new files including
`app/author/`, `lib/authors.ts`, `lib/metaDesc.ts`, `content/pages/`,
`scripts/import-page.mjs`, `scripts/fix-page-h1.mjs`,
`supabase/blog_author.sql`, `tests/metaDesc.test.mjs`.

**Already applied outside the build:** `supabase/blog_author.sql` was run by the
owner. The four CMS pages (about-us, contact, privacy-policy, terms-of-service)
are published and live.

**Do not commit:** `blog-live.html`, `hallam-live.html`, `sitemap-live.xml` —
throwaway test dumps in the repo root.

## Deployment method

```
npx tsc --noEmit
npx opennextjs-cloudflare build
node scripts/predeploy-check.mjs      # must print 4/4
npx opennextjs-cloudflare deploy
```

**Never skip the build.** `predeploy-check.mjs` exists because a stale build
shipped once and the failure was invisible.

**Build warnings that are safe and appear every time:** the Durable Object
"class not exported" warning (it is exported; wrangler cannot follow the
re-export), the Windows/WSL advisory, and the `middleware` → `proxy` deprecation
notice.

**Note:** `npx tsc --noEmit` must be run on the owner's Windows machine.
TypeScript 7 ships a platform-native binary and the installed one is Windows-only.

**`predeploy-check.mjs` does NOT verify** that `/movie/[id]` is still SSG rather
than dynamic. Check the route table in the build output manually — if anything
touches `headers()` or `cookies()` in that path, ISR dies silently and the R2
costs return.

## Post-deploy verification

1. `/movie/lanterns` — Where to Watch should list real platforms in the HTML
2. `/trending` — MOVIEX and the vercel.app canonical should be gone; a new
   BUILD_ID may clear them via new cache keys. If not, purge manually.
3. `/author/syed-ahmad` — should exist; a post byline should link to it
4. `/movie/tmdb-m-19999999` — should be a genuine 404, not a 200

## Rollback

Cloudflare → Workers & Pages → **cinetonight** → Deployments → select the
previous version → **Rollback**. Instant, no rebuild.

## Outstanding, independent of the deploy

Set `CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` as Worker secrets.
Without them publishing never clears the edge — the root cause of P2.
