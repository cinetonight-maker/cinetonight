import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";

export default defineCloudflareConfig({
  // ISR page cache lives in the R2 bucket (NEXT_INC_CACHE_R2_BUCKET binding in
  // wrangler.jsonc), fronted by Cloudflare's regional edge cache so repeat
  // reads in the same region never touch R2.
  //
  // COST NOTE: R2 bills per operation and WRITES (Class A) are ~10x reads.
  // shouldLazilyUpdateOnCacheHit stays false so ordinary traffic never
  // triggers a background refresh of the regional copy - that turned plain
  // reads into extra operations for no visible freshness gain.
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
    shouldLazilyUpdateOnCacheHit: false,
  }),

  // Serve cached pages without booting the full Next.js server path.
  enableCacheInterception: true,

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
});
