import { defineCloudflareConfig } from "@opennextjs/cloudflare/config";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

export default defineCloudflareConfig({
  // ISR page cache lives in a free R2 bucket (NEXT_INC_CACHE_R2_BUCKET binding
  // in wrangler.jsonc). The regional wrapper keeps hot entries in Cloudflare's
  // edge Cache API so repeat hits do not touch R2 at all.
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  // Enables timed revalidation (the `revalidate` exports on our pages).
  // Needs the WORKER_SELF_REFERENCE service binding in wrangler.jsonc.
  queue: memoryQueue,
});
