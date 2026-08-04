import { Suspense } from "react";
import Listing from "./Listing";
import BlogSection from "./BlogSection";
import { GenresWidget, TrendingWidget, NewsWidget } from "./RightRail";

export default function ListingPage({
  title, sub, kind = "all", badges, defaultSort = "trending",
}: { title: string; sub: string; kind?: "movie" | "series" | "all"; badges?: boolean; defaultSort?: "trending" | "rating" | "year" | "az" }) {
  return (
    <div className="page">
      <div className="page__head"><h1>{title}</h1><p>{sub}</p></div>
      <div className="pagerow">
        <div className="pagemain">
          <Suspense fallback={<div className="empty">Loading…</div>}>
            <Listing kind={kind} badges={badges} defaultSort={defaultSort} />
          </Suspense>
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
