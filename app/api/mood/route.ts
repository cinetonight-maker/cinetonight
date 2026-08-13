import { NextResponse } from "next/server";
import { MOODS } from "@/lib/moods";
import { moodPoolTmdb, trendingLiveTmdb, tmdbConfigured } from "@/lib/tmdb";
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

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  const mood = MOODS.find((m) => m.id === id);
  if (!mood) return NextResponse.json({ error: "Unknown mood." }, { status: 400 });
  if (!tmdbConfigured) return NextResponse.json({ results: [] });

  try {
    const results = mood.genres.length
      ? await moodPoolTmdb(mood.genres, mood.exclude ?? [], 20)
      : await trendingLiveTmdb("all", 20);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
