import "server-only";
import { browsePage, tmdbConfigured, type BrowseSort } from "./tmdb";
import { getMovies } from "./data";
import type { Movie, MovieKind } from "./types";

/** Shared by app/api/browse/route.ts (client-side filter/sort/page changes
 *  after the initial load) AND the listing pages themselves (ListingPage.tsx,
 *  server-rendering the FIRST page of results directly into the HTML). Kept
 *  in one place so both call sites can never drift — previously this logic
 *  only lived in the API route, which meant the initial page load rendered
 *  an empty skeleton and Googlebot's first pass over /movies, /tv-shows,
 *  /web-series, /trending, /latest and every genre filter saw no titles at
 *  all, only the loading grid (client fetch happens after mount). */

const PAGE_SIZE = 20;

export interface BrowseResponse {
  results: Movie[];
  page: number;
  totalPages: number;
  source: "tmdb" | "local";
  tmdbConfigured?: boolean;
}

/** Paginated fallback over the local catalogue — used when TMDB is
 *  unreachable/unconfigured, so listing pages never just show nothing. */
function localFallback(movies: Movie[], kind: MovieKind | "all", sort: BrowseSort, genre: string | undefined, page: number): BrowseResponse {
  let out = movies.slice();
  if (kind !== "all") out = out.filter((m) => m.kind === kind);
  if (genre && genre !== "All") out = out.filter((m) => m.genres.includes(genre));
  if (sort === "rating") out.sort((a, b) => b.rating - a.rating);
  else if (sort === "year") out.sort((a, b) => b.year - a.year);
  else if (sort === "az") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));

  const totalPages = Math.max(1, Math.ceil(out.length / PAGE_SIZE));
  const start = (Math.max(1, page) - 1) * PAGE_SIZE;
  const results: Movie[] = out.slice(start, start + PAGE_SIZE);
  return { results, page: Math.max(1, page), totalPages, source: "local" };
}

export async function getBrowsePage(params: { kind: MovieKind | "all"; sort: BrowseSort; genre?: string; page?: number }): Promise<BrowseResponse> {
  const page = Math.max(1, params.page ?? 1);
  const live = await browsePage({ ...params, page });
  if (live && live.results.length) return { ...live, source: "tmdb" };

  const movies = await getMovies();
  return { ...localFallback(movies, params.kind, params.sort, params.genre, page), tmdbConfigured };
}
