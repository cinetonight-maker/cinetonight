"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Icon from "./Icon";
import MovieCard from "./MovieCard";
import type { Movie } from "@/lib/types";

type Sort = "trending" | "rating" | "year" | "az";

/** Curated, TMDB-recognized genre names (covers movie + tv; a couple map to
 *  the tv-side equivalent server-side, see lib/tmdb.ts TV_GENRE_ALIAS). */
const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War",
];

interface BrowseResponse { results: Movie[]; page: number; totalPages: number; source: "tmdb" | "local" }

export default function Listing({
  kind = "all", badges, defaultSort = "trending",
}: { kind?: "movie" | "series" | "all"; badges?: boolean; defaultSort?: Sort }) {
  const params = useSearchParams();
  const [genre, setGenre] = useState(params.get("genre") ?? "All");
  const [sort, setSort] = useState<Sort>(defaultSort);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Any filter change starts back at page 1.
  useEffect(() => { setPage(1); }, [kind, genre, sort]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const q = new URLSearchParams({ kind, sort, page: String(page) });
    if (genre !== "All") q.set("genre", genre);
    fetch(`/api/browse?${q}`)
      .then((r) => r.json())
      .then((d: BrowseResponse) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [kind, genre, sort, page]);

  const results = data?.results ?? [];
  const totalPages = Math.max(1, data?.totalPages ?? 1);

  // Compact page-number list: first, last, and a window around the current page.
  const pageNums = (() => {
    const span = 2;
    const nums = new Set<number>([1, totalPages]);
    for (let p = page - span; p <= page + span; p++) if (p >= 1 && p <= totalPages) nums.add(p);
    return [...nums].sort((a, b) => a - b);
  })();

  return (
    <>
      <div className="controls">
        <div className="chip-row">
          <button className={`fchip${genre === "All" ? " on" : ""}`} onClick={() => setGenre("All")}>All</button>
          {GENRES.map((g) => (
            <button key={g} className={`fchip${genre === g ? " on" : ""}`} onClick={() => setGenre(g)}>{g}</button>
          ))}
        </div>
        <div className="cright">
          <span className="count">{loading ? "Loading…" : data ? `Page ${page} of ${totalPages}` : ""}</span>
          <select className="sel" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="trending">Trending</option>
            <option value="rating">Top Rated</option>
            <option value="year">Newest</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      {data === null ? (
        <div className="grid">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skel" />)}</div>
      ) : results.length ? (
        <>
          <div className="grid">
            {results.map((m) => <MovieCard key={m.id} movie={m} badge={badges ? "NEW" : undefined} />)}
          </div>
          {totalPages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button className="pager__btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <Icon name="chevl" size={14} /> Prev
              </button>
              {pageNums.map((n, i) => (
                <span key={n} style={{ display: "contents" }}>
                  {i > 0 && n - pageNums[i - 1] > 1 && <span className="pager__gap">…</span>}
                  <button className={`pager__num${n === page ? " on" : ""}`} onClick={() => setPage(n)} aria-current={n === page}>{n}</button>
                </span>
              ))}
              <button className="pager__btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next <Icon name="chevr" size={14} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="empty">No titles match your filters.</div>
      )}
    </>
  );
}
