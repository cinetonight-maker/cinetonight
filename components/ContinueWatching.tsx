import Link from "next/link";
import Row from "./Row";
import MovieCard from "./MovieCard";
import type { Movie, ContinueItem } from "@/lib/types";

export default function ContinueWatching({ items, movies, title = "Continue Watching" }: { items: ContinueItem[]; movies: Movie[]; title?: string }) {
  const rendered = items.map((c) => {
    const m = movies.find((x) => x.id === c.id);
    return m ? <MovieCard key={c.id} movie={m} progress={c.progress} note={c.note} /> : null;
  }).filter(Boolean);
  if (!rendered.length) return null;
  return (
    <Row title={title} all={<Link className="sec__all" href="/my-list">My List</Link>}>
      {rendered}
    </Row>
  );
}
