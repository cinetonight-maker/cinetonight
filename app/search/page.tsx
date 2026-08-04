import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResults from "@/components/SearchResults";
import { TrendingWidget, NewsWidget } from "@/components/RightRail";
export const metadata: Metadata = { title: "Search" };
export default function Page() {
  return (
    <div className="page">
      <div className="pagerow">
        <div className="pagemain">
          <Suspense fallback={<div className="empty">Loading…</div>}><SearchResults /></Suspense>
        </div>
        <aside className="pageaside"><TrendingWidget /><NewsWidget /></aside>
      </div>
    </div>
  );
}
