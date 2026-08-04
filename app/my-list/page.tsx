import type { Metadata } from "next";
import MyList from "@/components/MyList";
import { TrendingWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
export const metadata: Metadata = { title: "My List" };
export default function Page() {
  return (
    <div className="page">
      <div className="page__head"><h1>My List</h1><p>Your saved movies and shows.</p></div>
      <div className="pagerow">
        <div className="pagemain"><MyList /></div>
        <aside className="pageaside"><TrendingWidget /><BlogWidget /><NewsWidget /></aside>
      </div>
    </div>
  );
}
