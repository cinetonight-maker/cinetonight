import { NextResponse } from "next/server";
import { getMovie } from "@/lib/data";
import { parseTmdbId, trailerFor } from "@/lib/tmdb";

export const runtime = "nodejs";

/**
 * GET /api/trailer?id=<catalogue-slug | tmdb-m-123>
 * Returns { key } — the YouTube key for the title's trailer, or null.
 */
export async function GET(request: Request) {
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ key: null });

  // cached on the catalogue entry after `npm run sync`
  const local = getMovie(id);
  if (local?.trailerKey) return NextResponse.json({ key: local.trailerKey });

  // otherwise ask TMDB directly
  const parsed = parseTmdbId(id);
  const kind = parsed?.kind ?? local?.kind ?? "movie";
  const tmdb = parsed?.id ?? (local?.tmdbId ? String(local.tmdbId) : null);
  if (!tmdb) return NextResponse.json({ key: null });

  return NextResponse.json({ key: await trailerFor(kind, tmdb) });
}
