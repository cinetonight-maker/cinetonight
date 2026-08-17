import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

export default defineCloudflareConfig({
  // ISR page cache lives in a free R2 bucket (NEXT_INC_CACHE_R2_BUCKET binding
  // in wrangler.jsonc), wrapped in Cloudflare's regional edge cache so repeat
  // hits in the same region never touch R2 at all.
  //
  // COST NOTE (learned the hard way): R2 bills per operation, and WRITES
  // (Class A) are ~10x the price of reads. Every page revalidation writes the
  // page entry plus its fetch-cache entries, and each Cloudflare location
  // revalidates independently - so short `revalidate` windows on pages with
  // thousands of URLs (movie/*, person/*) multiply into millions of writes a
  // month. The defence is three-layered:
  //   1. long `revalidate` windows on the crawler-heavy pages (see each page),
  //   2. this regional cache absorbing repeat reads,
  //   3. shouldLazilyUpdateOnCacheHit: false - do NOT refresh the regional
  //      copy from R2 in the background on every hit; that turned ordinary
  //      traffic into extra operations for no visible freshness gain.
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
    shouldLazilyUpdateOnCacheHit: false,
  }),

  // Serve cached pages straight from the cache without booting the full
  // Next.js server path. Cuts CPU time per request and stops redundant
  // revalidation work on pages that are already fresh.
  enableCacheInterception: true,

  // Enables timed revalidation (the `revalidate` exports on our pages).
  // Needs the WORKER_SELF_REFERENCE service binding in wrangler.jsonc.
  queue: memoryQueue,
});
