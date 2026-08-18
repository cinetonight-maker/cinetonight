import { NextResponse } from "next/server";
import { MOODS } from "@/lib/moods";
import { moodPoolTmdb, discoverPoolTmdb, trendingLiveTmdb, tmdbConfigured } from "@/lib/tmdb";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

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
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const sp = new URL(request.url).searchParams;
  const id = (sp.get("id") ?? "").trim();
  const mood = MOODS.find((m) => m.id === id);
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
  const opts = {
    maxRuntime: ALLOWED_RUNTIME.includes(rawRuntime) ? rawRuntime : undefined,
    minRating: ALLOWED_RATING.includes(rawRating) ? rawRating : undefined,
    maxVotes: ALLOWED_MAX_VOTES.includes(rawMaxVotes) ? rawMaxVotes : undefined,
    kind: rawKind === "movie" || rawKind === "series" ? (rawKind as "movie" | "series") : undefined,
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
        : await trendingLiveTmdb("all", 20);
    // The param space is a CLOSED set (clamped above), so the distinct URLs
    // are few and safe to edge-cache. Every repeat mood/Quick Pick click
    // across ALL visitors then hits Cloudflare's edge instead of the Worker.
    // Variety is unaffected: the client shuffles the pool after fetching.
    // Success responses only - never cache errors or rate-limit replies.
    const res = NextResponse.json({ results });
    res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res;
  } catch {
    return NextResponse.json({ results: [] });
  }
}
