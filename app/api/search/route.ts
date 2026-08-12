import { NextResponse } from "next/server";
import { searchTmdb, tmdbConfigured } from "@/lib/tmdb";
import { getMovies } from "@/lib/data";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous limit — search-as-you-type can legitimately fire several
// requests per second per visitor — but bounded so a scripted flood can't
// run up the (paid, keyed) TMDB API's quota for free.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/** GET /api/search?q=... — local catalogue matches first, then live TMDB results. */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "search", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [], source: "empty" });

  const needle = q.toLowerCase();
  const MOVIES = await getMovies();
  const local = MOVIES.filter(
    (m) => m.title.toLowerCase().includes(needle) || m.genres.join(" ").toLowerCase().includes(needle),
  );

  const remote = await searchTmdb(q);
  const seen = new Set(local.map((m) => m.tmdbId).filter(Boolean));
  const merged = [...local, ...remote.filter((m) => !seen.has(m.tmdbId))];

  return NextResponse.json({
    results: merged,
    localCount: local.length,
    source: tmdbConfigured ? "tmdb" : "local",
  });
}
