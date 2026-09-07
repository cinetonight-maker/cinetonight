import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import { withFilter } from "@opennextjs/cloudflare/overrides/tag-cache/tag-cache-filter";
import { isCmsTag } from "./lib/revalidatePlan";
import { withoutFetchCachePersistence } from "./lib/tmdbFetchCache";

export default defineCloudflareConfig({
  // ISR page cache lives in the R2 bucket (NEXT_INC_CACHE_R2_BUCKET binding in
  // wrangler.jsonc), fronted by Cloudflare's regional edge cache so repeat
  // reads in the same region never touch R2.
  //
  // COST NOTE: R2 bills per operation and WRITES (Class A) are ~10x reads.
  // shouldLazilyUpdateOnCacheHit stays false so ordinary traffic never
  // triggers a background refresh of the regional copy - that turned plain
  // reads into extra operations for no visible freshness gain.
  // COST FIX (Sep 2026): "fetch" cache entries (TMDB API responses) are no
  // longer persisted to R2 - see lib/tmdbFetchCache.ts for the full
  // rationale. Page-level ISR entries ("cache") still go to R2 unchanged.
  incrementalCache: withRegionalCache(
    withoutFetchCachePersistence(r2IncrementalCache),
    {
      mode: "long-lived",
      shouldLazilyUpdateOnCacheHit: false,
    }
  ),

  // Serve cached pages without booting the full Next.js server path.
  // DISABLED 20 Aug 2026 - root cause of the production RSC prefetch loop.
  // The interceptor answers cached routes before Next runs, but it mishandles
  // Next 16's prefetch header variants on STATICALLY-CACHED routes (see
  // opennextjs-cloudflare issue #1223 - same failure family): one variant per
  // cycle errors (503/500), Next 16 aggressively re-prefetches failed entries
  // (vercel/next.js #85489), and every static route with a viewport-visible
  // link loops forever (~40 req/s per tab; observed 25k+ requests in one
  // session, on /follow, /free-movies and the classic detail pages - dynamic
  // routes never looped because they bypass the interceptor). Disabling costs
  // a little Worker CPU per cached-page request (CPU is pennies here) and
  // changes NOTHING about R2 keys, TTLs, or the Phase 1 architecture.
  // Re-enable only after the adapter fixes RSC-variant handling AND a
  // production Network-tab check shows no _rsc repetition.
  enableCacheInterception: false,

  // REVALIDATION DE-DUPLICATION - the fix for the largest remaining source of
  // R2 writes.
  //
  // The previous memory queue de-duped per ISOLATE. Cloudflare runs hundreds
  // of locations, each with its own isolate, and each one independently
  // noticed the same page was stale and regenerated it: one expired page
  // became many regenerations and many identical R2 writes.
  //
  // doQueue routes every revalidation through a single Durable Object, so a
  // stale page is regenerated ONCE globally no matter how many locations ask.
  // withQueueCache adds a short regional cache in front of that, so repeat
  // triggers inside one region are dropped before they even reach the DO -
  // cheaper still, and it keeps the DO request count inside the included
  // allowance.
  queue: queueCache(doQueue, { regionalCacheTtlSec: 5 }),

  // ON-DEMAND REVALIDATION (Aug 2026) — the smallest thing that makes an
  // admin Publish/Update visible without waiting out a TTL.
  //
  // WHAT THIS DOES: gives revalidateTag()/revalidatePath() somewhere to record
  // "this tag went stale at T". Without it both are silent no-ops on
  // Cloudflare, which is why a saved post used to stay invisible for up to
  // its TTL. Marking a tag stale does not delete or rewrite anything: the
  // affected route is simply regenerated on its NEXT request, through the
  // same DO queue above, so one publish still costs one rebuild and one R2
  // write per affected route.
  //
  // WHAT THIS DOES NOT DO: it changes no TTL, no R2 key, no incremental-cache
  // override, and not enableCacheInterception (still false above).
  //
  // WHY FILTERED: the tag store is consulted on cache reads. withFilter limits
  // that to the handful of tags this project ever revalidates — our own
  // "cms:*" tags, the homepage, and /blog plus its articles (see
  // lib/revalidatePlan.ts). Every other route — movie pages, person pages,
  // browse pages, the whole long tail — never queries D1 at all and behaves
  // exactly as it did before this was added.
  //
  // Requires the NEXT_TAG_CACHE_D1 binding in wrangler.jsonc. If that binding
  // is missing the override disables itself and the site falls back to plain
  // TTL expiry, i.e. the previous behaviour, rather than erroring.
  tagCache: withFilter({
    tagCache: d1NextTagCache,
    filterFn: isCmsTag,
  }),

  // cdnInvalidation is deliberately NOT enabled. OpenNext's built-in purge
  // works by Cloudflare CACHE TAGS, which are Enterprise-only; on this plan
  // those calls would fail on every revalidation. The edge copy is instead
  // cleared by a SINGLE-FILE purge of the exact URLs, from the admin API —
  // see lib/revalidateCms.ts. Never "purge everything", never a prefix.
});
