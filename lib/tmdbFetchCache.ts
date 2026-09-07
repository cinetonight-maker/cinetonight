import type {
  CacheEntryType,
  CacheValue,
  IncrementalCache,
  WithLastModified,
} from "@opennextjs/aws/types/overrides.js";

/**
 * Wraps an IncrementalCache so "fetch" entries (TMDB API responses, cached via
 * Next's fetch cache) are never persisted to the durable store (R2), while
 * "cache" entries (the rendered page/ISR payload) pass through unchanged.
 *
 * WHY: confirmed from the Cloudflare billing breakdown that R2 Class A
 * Operations is ~83% of the entire bill. Next writes one fetch-cache entry
 * (one R2 PUT) per unique cached TMDB call - fetchTitle, relatedTmdb,
 * watchProvidersWithFallback, trailerFor, fetchSeasons, fetchSeasonEpisodes,
 * episodeTrailerTmdb (see lib/tmdb.ts) - and that volume (~750K TMDB
 * subrequests/24h during the incident) dwarfs page-cache writes, which only
 * happen on a real page render/regenerate (revalidate = 259200s / 72h on
 * movie pages). This targets the actual cost driver instead of the page
 * cache, which is left exactly as it is today.
 *
 * NOT LOST: RegionalCache (the layer above this store, in
 * open-next.config.ts) still populates the free, per-datacenter Cache API on
 * every set() and checks it first on every get() - that happens
 * unconditionally in RegionalCache itself, regardless of what the
 * underlying store below does. So a "fetch" entry is still served from the
 * free per-colo cache for its TTL window (see TTL tiers in lib/tmdb.ts).
 * Only a cache MISS in a given Cloudflare datacenter now calls TMDB
 * directly, instead of falling back to a durable R2 copy written by some
 * other datacenter.
 *
 * delete() is left unfiltered (always forwarded) - it has no cacheType
 * param to route on, and purges are rare/cheap, not a cost driver.
 */
export function withoutFetchCachePersistence(store: IncrementalCache): IncrementalCache {
  return {
    name: `${store.name}-no-fetch-persist`,
    async get<CacheType extends CacheEntryType = "cache">(
      key: string,
      cacheType?: CacheType
    ): Promise<WithLastModified<CacheValue<CacheType>> | null> {
      if (cacheType === "fetch") return null;
      return store.get(key, cacheType);
    },
    async set<CacheType extends CacheEntryType = "cache">(
      key: string,
      value: CacheValue<CacheType>,
      cacheType?: CacheType
    ): Promise<void> {
      if (cacheType === "fetch") return;
      return store.set(key, value, cacheType);
    },
    async delete(key: string): Promise<void> {
      return store.delete(key);
    },
  };
}
