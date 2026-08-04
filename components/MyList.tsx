"use client";

import MovieCard from "./MovieCard";
import { getMovie } from "@/lib/data";
import { useWatchlist } from "@/lib/watchlist";

export default function MyList() {
  const { ids } = useWatchlist();
  const items = ids.map(getMovie).filter(Boolean) as NonNullable<ReturnType<typeof getMovie>>[];
  if (!items.length) {
    return <div className="empty">Your list is empty — open a title and tap “Add to Watchlist”.</div>;
  }
  return <div className="grid">{items.map((m) => <MovieCard key={m.id} movie={m} />)}</div>;
}
