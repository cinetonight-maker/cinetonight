import { NextResponse } from "next/server";
import { fetchSeasonEpisodes, episodeTrailerTmdb } from "@/lib/tmdb";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * GET /api/tv/<tmdb-tv-id>?season=N            → { episodes: EpisodeInfo[] }
 * GET /api/tv/<tmdb-tv-id>?season=N&episode=M  → { key: string | null }
 *
 * Powers the season/episode picker on a series' detail page. The trailer
 * lookup falls back episode → season → show inside episodeTrailerTmdb, so
 * a null key here really means "TMDB has no video at all for this show".
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isRateLimited(clientKey(request), "tv", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad show id." }, { status: 400 });

  const url = new URL(request.url);
  const season = Number(url.searchParams.get("season"));
  if (!Number.isInteger(season) || season < 1) {
    return NextResponse.json({ error: "Missing/invalid season." }, { status: 400 });
  }

  const episodeParam = url.searchParams.get("episode");
  if (episodeParam !== null) {
    const episode = Number(episodeParam);
    if (!Number.isInteger(episode) || episode < 1) {
      return NextResponse.json({ error: "Invalid episode." }, { status: 400 });
    }
    return NextResponse.json({ key: await episodeTrailerTmdb(id, season, episode) });
  }

  return NextResponse.json({ episodes: await fetchSeasonEpisodes(id, season) });
}
