import type { Metadata } from "next";
import MyList from "@/components/MyList";
import { TrendingWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
import { getMovies } from "@/lib/data";

export const metadata: Metadata = { title: "My List" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const movies = await getMovies();
  return (
    <div className="page">
      <div className="page__head"><h1>My List</h1><p>Your saved movies and shows.</p></div>
      <div className="pagerow">
        <div className="pagemain"><MyList movies={movies} /></div>
        <aside className="pageaside"><TrendingWidget /><BlogWidget /><NewsWidget /></aside>
      </div>
    </div>
  );
}
