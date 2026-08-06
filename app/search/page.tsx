import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResults from "@/components/SearchResults";
import { TrendingWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, genresOf, trendingNow } from "@/lib/data";

export const metadata: Metadata = { title: "Search" };
export const dynamic = "force-dynamic";

export default async function Page() {
  // Fetched here (server) and handed to the client SearchResults component
  // for its empty/pre-query state — trending picks + genre shortcuts, same
  // discovery pattern competitors' search tabs use, instead of a blank
  // "type to search" screen.
  const movies = await getMovies();
  const trending = trendingNow(movies, 10);
  const genres = genresOf(movies).slice(0, 12);

  return (
    <div className="page">
      <div className="pagerow">
        <div className="pagemain">
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <SearchResults trending={trending} genres={genres} />
          </Suspense>
        </div>
        <aside className="pageaside"><TrendingWidget /><NewsWidget /></aside>
      </div>
    </div>
  );
}
