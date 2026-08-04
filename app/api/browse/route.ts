import { NextResponse } from "next/server";
import { browsePage, tmdbConfigured, type BrowseSort } from "@/lib/tmdb";
import { MOVIES } from "@/lib/data";
import type { Movie, MovieKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const SORTS: BrowseSort[] = ["trending", "rating", "year", "az"];

/** Paginated fallback over the local catalogue — used when TMDB is
 *  unreachable/unconfigured, so listing pages never just show nothing. */
function localFallback(kind: MovieKind | "all", sort: BrowseSort, genre: string | undefined, page: number) {
  let out = MOVIES.slice();
  if (kind !== "all") out = out.filter((m) => m.kind === kind);
  if (genre && genre !== "All") out = out.filter((m) => m.genres.includes(genre));
  if (sort === "rating") out.sort((a, b) => b.rating - a.rating);
  else if (sort === "year") out.sort((a, b) => b.year - a.year);
  else if (sort === "az") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));

  const totalPages = Math.max(1, Math.ceil(out.length / PAGE_SIZE));
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  const results: Movie[] = out.slice(start, start + PAGE_SIZE);
  return { results, page: Math.max(1, page), totalPages, source: "local" as const };
}

/** GET /api/browse?kind=movie|series|all&sort=trending|rating|year|az&genre=Action&page=1
 *  Real, paginated, globally-mixed TMDB results — falls back to the local
 *  catalogue (also paginated) if TMDB isn't reachable/configured. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "all";
  const kind: MovieKind | "all" = kindParam === "movie" || kindParam === "series" ? kindParam : "all";
  const sortParam = url.searchParams.get("sort") ?? "trending";
  const sort: BrowseSort = (SORTS as string[]).includes(sortParam) ? (sortParam as BrowseSort) : "trending";
  const genre = url.searchParams.get("genre") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const live = await browsePage({ kind, sort, genre, page });
  if (live && live.results.length) return NextResponse.json({ ...live, source: "tmdb" });

  return NextResponse.json({ ...localFallback(kind, sort, genre, page), tmdbConfigured });
}
