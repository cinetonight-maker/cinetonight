"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import MovieCard from "./MovieCard";
import BigCard from "./BigCard";
import type { Movie } from "@/lib/types";

type State = { loading: boolean; results: Movie[]; source: string; error: string | null };

export default function SearchResults({
  trendingMovie = null, trendingSeries = null, genres = [],
}: { trendingMovie?: Movie | null; trendingSeries?: Movie | null; genres?: string[] }) {
  const q = (useSearchParams().get("q") ?? "").trim();
  const [s, setS] = useState<State>({ loading: false, results: [], source: "", error: null });

  useEffect(() => {
    if (!q) { setS({ loading: false, results: [], source: "", error: null }); return; }
    let cancelled = false;
    setS((p) => ({ ...p, loading: true, error: null }));
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Search failed (${r.status})`))))
      .then((d) => { if (!cancelled) setS({ loading: false, results: d.results ?? [], source: d.source ?? "", error: null }); })
      .catch((e) => { if (!cancelled) setS({ loading: false, results: [], source: "", error: e.message }); });
    return () => { cancelled = true; };
  }, [q]);

  const sub = s.loading
    ? "Searching…"
    : s.error
      ? s.error
      : q
        ? `${s.results.length} title${s.results.length === 1 ? "" : "s"} found`
        : "Type in the search bar to find any movie or show.";

  return (
    <>
      <div className="page__head">
        <h1>{q ? `Results for “${q}”` : "Search"}</h1>
        <p>{sub}</p>
      </div>

      {s.loading && (
        <div className="grid">
          {Array.from({ length: 12 }).map((_, i) => <div className="skel" key={i} />)}
        </div>
      )}

      {!s.loading && s.results.length > 0 && (
        <div className="grid">
          {s.results.map((m) => <MovieCard key={m.id} movie={m} />)}
        </div>
      )}

      {!s.loading && q && !s.results.length && !s.error && (
        <div className="empty">
          No titles match “{q}”.
          {s.source === "local" && (
            <><br /><span style={{ fontSize: 13 }}>Live search is off — add TMDB_API_KEY to .env.local to search everything.</span></>
          )}
        </div>
      )}

      {/* Pre-query state: trending picks + genre shortcuts instead of a
          blank screen, so there's always something to browse. Just the top
          trending movie + top trending show as spotlight cards, not a
          whole grid. */}
      {!q && (
        <>
          {(trendingMovie || trendingSeries) && (
            <section className="sec">
              <div className="sec__head"><h2>Trending Now</h2></div>
              <div className="spotlight2">
                {trendingMovie && <BigCard movie={trendingMovie} eyebrow="#1 Trending Movie" />}
                {trendingSeries && <BigCard movie={trendingSeries} eyebrow="#1 Trending Show" />}
              </div>
            </section>
          )}
          {genres.length > 0 && (
            <section className="sec">
              <div className="sec__head"><h2>Explore Genres</h2></div>
              <div className="genregrid">
                {genres.map((g) => (
                  <Link key={g} className="gchip" href={`/movies?genre=${encodeURIComponent(g)}`}>{g}</Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
