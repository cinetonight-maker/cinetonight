import Listing from "./Listing";
import BlogSection from "./BlogSection";
import { GenresWidget, TrendingWidget, NewsWidget } from "./RightRail";
import { getBrowsePage } from "@/lib/browse";
import type { BrowseSort } from "@/lib/tmdb";

/** Now an async Server Component: it fetches the first page of results
 *  itself (via lib/browse.ts, the same helper /api/browse uses) and hands
 *  them to <Listing> as `initialData` so they're part of the real
 *  server-rendered HTML — genre/sort/page changes after that still happen
 *  client-side against /api/browse as before. Previously <Listing> fetched
 *  everything client-side on mount, so the initial HTML for /movies,
 *  /tv-shows, /web-series, /trending, /latest and every genre filter was an
 *  empty skeleton grid — invisible to a crawler that doesn't wait around
 *  for client JS to run. */
export default async function ListingPage({
  title, sub, kind = "all", badges, defaultSort = "trending", genre,
}: {
  title: string; sub: string; kind?: "movie" | "series" | "all"; badges?: boolean;
  defaultSort?: BrowseSort; genre?: string;
}) {
  const initialGenre = genre && genre !== "All" ? genre : "All";
  const initialData = await getBrowsePage({
    kind, sort: defaultSort, page: 1,
    genre: initialGenre === "All" ? undefined : initialGenre,
  });

  return (
    <div className="page">
      <div className="page__head"><h1>{title}</h1><p>{sub}</p></div>
      <div className="pagerow">
        <div className="pagemain">
          <Listing kind={kind} badges={badges} defaultSort={defaultSort} initialGenre={initialGenre} initialData={initialData} />
        </div>
        <aside className="pageaside">
          <GenresWidget />
          <TrendingWidget />
          <NewsWidget />
        </aside>
      </div>
      <BlogSection />
    </div>
  );
}
