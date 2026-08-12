import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResults from "@/components/SearchResults";
import { TrendingWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, genresOf, trendingNow } from "@/lib/data";
import { trendingLiveTmdb, tmdbConfigured } from "@/lib/tmdb";

// Internal search-results pages are near-infinite query-string variations
// of thin/duplicate content — Google's own guidance is to keep these out of
// the index (they add no unique value to search results and can dilute
// crawl budget away from actual content pages). robots: noindex here does
// NOT stop the /search page itself from working; it just tells Google not
// to list it.
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Fetched here (server) and handed to the client SearchResults component
  // for its empty/pre-query state — trending picks + genre shortcuts, same
  // discovery pattern competitors' search tabs use, instead of a blank
  // "type to search" screen. Just the #1 trending movie + #1 trending show
  // as spotlight cards (not a whole grid) — matches the reference layout.
  //
  // These used to be sorted by the local catalogue's `votes` field, which
  // is static — it never changes on its own, so the same two titles sat
  // here indefinitely. Pulled from the real TMDB /trending endpoint now
  // (same fix as the homepage/‌/trending page), same as the rest of the
  // site; falls back to the local sort only if TMDB is unreachable.
  const [movies, liveMovieTrending, liveSeriesTrending] = await Promise.all([
    getMovies(),
    tmdbConfigured ? trendingLiveTmdb("movie", 1) : Promise.resolve([]),
    tmdbConfigured ? trendingLiveTmdb("series", 1) : Promise.resolve([]),
  ]);
  const trendingMovie = liveMovieTrending[0] ?? trendingNow(movies.filter((m) => m.kind === "movie"), 1)[0] ?? null;
  const trendingSeries = liveSeriesTrending[0] ?? trendingNow(movies.filter((m) => m.kind === "series"), 1)[0] ?? null;
  const genres = genresOf(movies).slice(0, 12);

  return (
    <div className="page">
      <div className="pagerow">
        <div className="pagemain">
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <SearchResults trendingMovie={trendingMovie} trendingSeries={trendingSeries} genres={genres} />
          </Suspense>
        </div>
        <aside className="pageaside"><TrendingWidget /><NewsWidget /></aside>
      </div>
    </div>
  );
}
