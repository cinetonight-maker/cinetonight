"use client";

import { useEffect, useState } from "react";
import MovieCard from "./MovieCard";
import { useWatchlist } from "@/lib/watchlist";
import type { Movie } from "@/lib/types";

/** Saved ids can point at curated catalogue titles (passed in via props)
 *  OR live TMDB titles the visitor saved from a live row. The latter
 *  aren't in the curated list, which used to make them silently vanish
 *  here (count said 3, grid showed 0). Missing ids now resolve through
 *  /api/title so every saved title renders. */
export default function MyList({ movies }: { movies: Movie[] }) {
  const { ids } = useWatchlist();
  const [resolved, setResolved] = useState<Record<string, Movie>>({});

  useEffect(() => {
    const missing = ids.filter((id) => !movies.some((m) => m.id === id) && !resolved[id]);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, Movie> = {};
      await Promise.all(missing.map(async (id) => {
        try {
          const r = await fetch(`/api/title?id=${encodeURIComponent(id)}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.movie) found[id] = d.movie as Movie;
          }
        } catch { /* leave unresolved */ }
      }));
      if (!cancelled && Object.keys(found).length) setResolved((prev) => ({ ...prev, ...found }));
    })();
    return () => { cancelled = true; };
  }, [ids, movies, resolved]);

  const items = ids
    .map((id) => movies.find((m) => m.id === id) ?? resolved[id])
    .filter(Boolean) as Movie[];

  if (!ids.length) {
    return <div className="empty">Your list is empty. Open a title and tap Add to Watchlist.</div>;
  }
  if (!items.length) {
    return <div className="empty">Loading your saved titles…</div>;
  }
  return <div className="grid">{items.map((m) => <MovieCard key={m.id} movie={m} />)}</div>;
}
