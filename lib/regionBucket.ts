/* ============================================================================
 * lib/regionBucket.ts — the CLOSED set of audience regions the recommendation
 * engine is allowed to know about.
 *
 * WHY BUCKETS AND NOT COUNTRY CODES. Every value here ends up as a TMDB
 * discover parameter and therefore as an edge-cache key on /api/mood (see the
 * closed-set rule in that route and in lib/quickPicks.ts). Two hundred ISO
 * country codes would mean two hundred times the cache entries for the exact
 * same six Quick Picks. Two buckets multiply the key space by two, which the
 * edge absorbs happily, and they capture the only distinction that actually
 * changes what a visitor should be shown today:
 *
 *   IN     — South Asia. Indian-origin film and TV is a first-class part of
 *            the answer, not a footnote. This is the site's largest audience
 *            by a wide margin (Search Console, Aug 2026: India roughly 2.5x
 *            the next country by clicks).
 *   GLOBAL — everyone else. Unbiased popularity, the behaviour every visitor
 *            got before this existed.
 *
 * Add a bucket only when there is real evidence an audience is being served
 * badly by both of these — and remember each one multiplies the cache keys.
 *
 * NO "server-only" IMPORT ON PURPOSE: the browser half of the picker needs
 * `asBucket` to echo back the bucket the server resolved for it.
 * ========================================================================= */

export const REGION_BUCKETS = ["IN", "GLOBAL"] as const;
export type RegionBucket = (typeof REGION_BUCKETS)[number];

/** Countries routed to the IN bucket. South Asia shares both the theatrical
 *  release calendar and the OTT catalogue that Indian-origin titles sit in,
 *  so Pakistan, Bangladesh, Sri Lanka and Nepal are served far better by the
 *  India-blended pool than by unbiased global popularity. */
const SOUTH_ASIA: ReadonlySet<string> = new Set(["IN", "PK", "BD", "LK", "NP", "BT", "MV"]);

/** ISO 3166-1 country code (as lib/region.ts resolves it) → bucket.
 *  Anything unrecognised falls to GLOBAL, which is the safe direction: an
 *  unknown visitor gets the neutral pool rather than a regional guess. */
export function bucketFor(country: string | null | undefined): RegionBucket {
  const c = String(country ?? "").trim().toUpperCase();
  return SOUTH_ASIA.has(c) ? "IN" : "GLOBAL";
}

/** Strict clamp for anything arriving over the wire. Returns undefined for
 *  every value that is not exactly one of the buckets, so a hand-edited query
 *  string can never mint a new cache entry — the same discipline the runtime
 *  and rating parameters already follow in app/api/mood/route.ts. */
export function asBucket(raw: string | null | undefined): RegionBucket | undefined {
  return (REGION_BUCKETS as readonly string[]).includes(String(raw)) ? (raw as RegionBucket) : undefined;
}
