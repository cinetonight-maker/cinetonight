"use client";

import MovieCard from "./MovieCard";
import { useWatchlist } from "@/lib/watchlist";
import type { Movie } from "@/lib/types";

export default function MyList({ movies }: { movies: Movie[] }) {
  const { ids } = useWatchlist();
  const items = ids.map((id) => movies.find((m) => m.id === id)).filter(Boolean) as Movie[];
  if (!items.length) {
    return <div className="empty">Your list is empty — open a title and tap “Add to Watchlist”.</div>;
  }
  return <div className="grid">{items.map((m) => <MovieCard key={m.id} movie={m} />)}</div>;
}
