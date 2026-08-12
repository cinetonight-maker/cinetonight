import { NextResponse } from "next/server";
import { getMovie } from "@/lib/data";
import { parseTmdbId, trailerFor } from "@/lib/tmdb";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/**
 * GET /api/trailer?id=<catalogue-slug | tmdb-m-123>
 * Returns { key } — the YouTube key for the title's trailer, or null.
 */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "trailer", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ key: null });

  // cached on the catalogue entry after `npm run sync`
  const local = await getMovie(id);
  if (local?.trailerKey) return NextResponse.json({ key: local.trailerKey });

  // otherwise ask TMDB directly
  const parsed = parseTmdbId(id);
  const kind = parsed?.kind ?? local?.kind ?? "movie";
  const tmdb = parsed?.id ?? (local?.tmdbId ? String(local.tmdbId) : null);
  if (!tmdb) return NextResponse.json({ key: null });

  return NextResponse.json({ key: await trailerFor(kind, tmdb) });
}
