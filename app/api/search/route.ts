import { NextResponse } from "next/server";
import { searchTmdb, tmdbConfigured } from "@/lib/tmdb";
import { MOVIES } from "@/lib/data";

export const runtime = "nodejs";

/** GET /api/search?q=... — local catalogue matches first, then live TMDB results. */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [], source: "empty" });

  const needle = q.toLowerCase();
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
