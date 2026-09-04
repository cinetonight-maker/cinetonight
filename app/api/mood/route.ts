import { NextResponse } from "next/server";
import { ALL_MOODS } from "@/lib/moods";
import { moodPoolTmdb, discoverPoolTmdb, trendingPoolForBucket, tmdbConfigured } from "@/lib/tmdb";
import { discoveryFilter } from "@/lib/quality";
import { clientKey, isRateLimited } from "@/lib/rateLimit";
import { visitorRegion } from "@/lib/region";
import { asBucket, bucketFor, type RegionBucket } from "@/lib/regionBucket";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

/**
 * GET /api/mood?id=<mood id>  → { results: Movie[] }
 *
 * Live candidate pool for the Mood Roulette: popular, well-rated titles
 * matching the mood's genre recipe, straight from TMDB (see moodPoolTmdb).
 * "surprise" gets the real global trending list. Returns { results: [] }
 * when TMDB is unconfigured/unreachable — the client falls back to the
 * local catalogue pool, so the roulette always spins.
 */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "mood", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests - please slow down." }, { status: 429 });
  }

  const sp = new URL(request.url).searchParams;
  const id = (sp.get("id") ?? "").trim();
  const mood = ALL_MOODS.find((m) => m.id === id);
  if (!mood) return NextResponse.json({ error: "Unknown mood." }, { status: 400 });
  if (!tmdbConfigured) return NextResponse.json({ results: [] });

  // Constraints from the homepage Quick Picks / smart picker. Every value is
  // CLAMPED to a small allowed set: these become TMDB discover parameters and
  // therefore cache keys, so leaving them open would let anyone mint unlimited
  // cache entries by editing the query string.
  const ALLOWED_RUNTIME = [60, 90, 120, 150];
  const ALLOWED_RATING = [6, 6.5, 7, 7.5, 8];
  const ALLOWED_MAX_VOTES = [1500];
  const rawRuntime = Number(sp.get("maxRuntime"));
  const rawRating = Number(sp.get("minRating"));
  const rawMaxVotes = Number(sp.get("maxVotes"));
  const rawKind = sp.get("kind");

  /* REGION (lib/regionBucket.ts). Two ways in, and the difference is entirely
   * about who is allowed to reuse the response:
   *
   *  - ?region=IN|GLOBAL — an explicit bucket, so the bucket is part of the
   *    URL and therefore part of the edge-cache key. This response is shared
   *    with every visitor in that bucket, exactly like every mood response
   *    was shared before regions existed.
   *  - no region param — the visitor's first call of the session, before the
   *    browser has been told which bucket it is in. We resolve it from the
   *    geo header and answer correctly, but the answer is then PRIVATE: it
   *    varies by a header the cache key does not contain, so sharing it at
   *    the edge would serve an India-blended pool to someone in Berlin. The
   *    bucket comes back in the body and the client pins it onto every later
   *    call, so a session pays this once and is edge-cached from then on.
   *
   * Same closed-set discipline as the numeric clamps below: asBucket() only
   * accepts the two known values, so no hand-edited query string can mint an
   * unbounded set of cache entries. */
  const askedRegion = asBucket(sp.get("region"));
  const region: RegionBucket = askedRegion ?? bucketFor(await visitorRegion());
  const shareable = Boolean(askedRegion);

  const opts = {
    maxRuntime: ALLOWED_RUNTIME.includes(rawRuntime) ? rawRuntime : undefined,
    minRating: ALLOWED_RATING.includes(rawRating) ? rawRating : undefined,
    maxVotes: ALLOWED_MAX_VOTES.includes(rawMaxVotes) ? rawMaxVotes : undefined,
    kind: rawKind === "movie" || rawKind === "series" ? (rawKind as "movie" | "series") : undefined,
    region,
  };

  // Three routes, and the middle one is the bug fix. A mood WITH genres uses
  // the mood pool. A mood WITHOUT genres ("Surprise Me") but WITH constraints
  // - which is how the "Under 90 Minutes", "Highly Rated" and "Hidden Gem"
  // Quick Picks arrive - must go through constrained discovery, because the
  // plain trending list ignores maxRuntime, minRating and kind entirely and
  // would return titles that contradict what the UI just promised. Only an
  // unconstrained "Surprise Me" gets the trending list.
  const constrained = Boolean(opts.maxRuntime || opts.minRating || opts.maxVotes || opts.kind);

  try {
    const results = mood.genres.length
      ? await moodPoolTmdb(mood.genres, mood.exclude ?? [], 20, { ...opts, matchAll: mood.match === "all" })
      : constrained
        ? await discoverPoolTmdb(20, opts)
        : await trendingPoolForBucket(region, 20);
    // The param space is a CLOSED set (clamped above), so the distinct URLs
    // are few and safe to edge-cache. Every repeat mood/Quick Pick click
    // across ALL visitors then hits Cloudflare's edge instead of the Worker.
    // Variety is unaffected: the client shuffles the pool after fetching.
    // Success responses only - never cache errors or rate-limit replies.
    // Phase 2: recommendations must pass catalogue eligibility before a
    // visitor ever sees one (Tier A, topping up from B if the pool runs
    // short). In-memory filter of data already fetched — zero extra cost.
    // `region` is echoed so the client can pin it onto subsequent calls and
    // move itself onto the shared, edge-cached path (see the block above).
    const res = NextResponse.json({ results: discoveryFilter(results, 8), region });
    res.headers.set(
      "Cache-Control",
      shareable
        ? "public, s-maxage=3600, stale-while-revalidate=86400"
        : "private, max-age=600",
    );
    return res;
  } catch {
    return NextResponse.json({ results: [] });
  }
}
