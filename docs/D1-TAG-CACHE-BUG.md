# The D1 tag cache table was never created

**Found:** 22 August 2026, during the first real publish-speed test after the
`8682b8f8` deploy. **Fixed the same day.**

Read this before touching `open-next.config.ts`, and read it again if the D1
database is ever recreated.

---

## The symptom

Press **Publish** in the dashboard. The database is updated correctly. The live
page does not change, and keeps not changing until its TTL expires 30 minutes
later. No error anywhere: not in the dashboard, not in the Worker logs, not in
the browser console.

## The cause

The D1 tag cache stores its data in a table called `revalidations`. That table
did not exist. The database was created, the `NEXT_TAG_CACHE_D1` binding was
attached and confirmed in the deploy output, and the table inside it was never
made.

`opennextjs-cloudflare deploy` normally creates it. It only does so when it can
match the tag cache in `open-next.config.ts` **by its exact name**:

```js
// node_modules/@opennextjs/cloudflare/dist/cli/commands/populate-cache.js
const name = await resolveCacheName(tagCache);
switch (name) {
  case D1_TAG_NAME:                      // "d1-next-mode-tag-cache"
    populateD1TagCache(...);             // <- creates the table
    break;
  default:
    logger.info("Tag cache does not need populating");   // <- we landed here
}
```

Our config wraps the D1 tag cache in `withFilter(...)`, which is what keeps
movie pages, person pages and the whole long tail from querying D1 on every
read. That wrapper renames it:

```js
// tag-cache-filter.js
return { name: `filtered-${tagCache.name}`, ... };
```

`filtered-d1-next-mode-tag-cache` does not match `d1-next-mode-tag-cache`, the
switch falls through to `default`, and the table is silently never created.

**The deploy output said so, and it was misread at the time:**

```
Tag cache does not need populating
```

That line does not mean "there is nothing to populate". It means "I do not
recognise this tag cache, so I am skipping its setup entirely."

## Why nothing ever errored

Every read path in `D1NextModeTagCache` catches its own exceptions and returns
the safe-looking answer:

| Method | On error returns | Meaning |
| --- | --- | --- |
| `getLastRevalidated` | `0` | never revalidated |
| `hasBeenRevalidated` | `false` | not revalidated |
| `isStale` | `false` | not stale |

A missing table therefore reads as **"nothing has ever changed"** rather than as
a failure. Publishes were being written into a table that did not exist, and
every subsequent read confidently reported that nothing needed refreshing.

`writeTags` is the one method with no try/catch, but it runs after the database
write has already succeeded and inside the admin route's own error handling,
which is deliberately built so cache work can never turn a successful save into
a visible error. So even the throwing path stayed silent.

**This is the worst shape a bug can take: a feature that reports success while
doing nothing.** It survived a production-readiness audit, a release audit and a
deployment checklist because every one of those checked that the binding
existed, and the binding did exist.

## The fix

`d1/tag-cache-init.sql`, run once:

```
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --file=./d1/tag-cache-init.sql
```

Confirmed working immediately afterwards: publishing an edit updated the live
page in seconds, verified independently with `curl` against the production URL.

The table lives in the database, not the code, so it survives every deploy.
**This is not a deploy step.** Re-run it only if the D1 database is recreated.

## How to check it in future

```
npx wrangler d1 execute NEXT_TAG_CACHE_D1 --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

Healthy output lists **`revalidations`** alongside Cloudflare's own `_cf_KV`.
If `revalidations` is missing, on-demand revalidation is dead and every publish
is waiting on a TTL.

## What this changes about how we verify

The lesson is not about D1. It is that **"the binding is attached" was accepted
as proof that a subsystem worked.** The publish-speed test is the only check
that would ever have caught this, and it was the one item repeatedly deferred
because everything else looked green.

Any future claim of the form "publishing is instant" or "the cache clears
itself" gets tested end to end against production before it is written down as
working.

---

## Side note, checked at the same time and NOT a problem

`CACHE_PURGE_ZONE_ID` and `CACHE_PURGE_API_TOKEN` are unset, so
`lib/revalidateCms.ts` reports `cdn: "not-configured"` and skips the
single-file edge purge.

This currently costs nothing. Production response headers carry **no
`cf-cache-status`**, so Cloudflare is not edge-caching these Worker responses
at all and there is no edge copy to purge. The `s-maxage=3600` on `/blog/:path*`
is inert until a Cache Rule is added that makes the CDN honour it.

**If a Cache Rule is ever added for those paths, set those two secrets in the
same change** or publishing will look broken again for up to an hour, in
exactly the way it just did for thirty minutes.
