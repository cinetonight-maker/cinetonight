"use client";

import { useEffect, useRef, useState } from "react";
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

const SORT_LABEL: Record<Sort, string> = { trending: "Trending", rating: "Top Rated", year: "Newest", az: "A–Z" };

export default function Listing({
  kind = "all", badges, defaultSort = "trending", initialGenre = "All", initialData,
}: {
  kind?: "movie" | "series" | "all"; badges?: boolean; defaultSort?: Sort;
  /** First page of results, already fetched server-side by ListingPage.tsx
   *  for (kind, defaultSort, initialGenre, page 1) — this is what makes the
   *  real HTML (not just a loading skeleton) available to a crawler. */
  initialGenre?: string;
  initialData: BrowseResponse;
}) {
  const [genre, setGenre] = useState(initialGenre);
  const [sort, setSort] = useState<Sort>(defaultSort);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowseResponse>(initialData);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The very first run of the fetch effect below would otherwise re-request
  // the exact same (kind, genre, sort, page 1) the server already rendered
  // into `initialData` — skip it once, then fetch normally from then on.
  const skipNextFetch = useRef(true);

  // Mobile filter drawer locks page scroll while open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Any filter change starts back at page 1.
  useEffect(() => { setPage(1); }, [kind, genre, sort]);

  useEffect(() => {
    if (skipNextFetch.current) { skipNextFetch.current = false; return; }
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

  const results = data.results;
  const totalPages = Math.max(1, data.totalPages);

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
        <div className="chip-row chip-row--desktop">
          <button className={`fchip${genre === "All" ? " on" : ""}`} onClick={() => setGenre("All")}>All</button>
          {GENRES.map((g) => (
            <button key={g} className={`fchip${genre === g ? " on" : ""}`} onClick={() => setGenre(g)}>{g}</button>
          ))}
        </div>
        <button type="button" className="filterbtn" onClick={() => setDrawerOpen(true)}>
          <Icon name="menu" size={15} /> Filters{genre !== "All" ? <span className="filterbtn__dot" /> : null}
        </button>
        <div className="cright">
          <span className="count">{loading ? "Loading…" : data ? `Page ${page} of ${totalPages}` : ""}</span>
          <select className="sel sel--desktop" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="trending">Trending</option>
            <option value="rating">Top Rated</option>
            <option value="year">Newest</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      </div>

      {/* Mobile filter drawer — same genre/sort state as the desktop chip
          row + select above, just presented as a slide-in panel so it
          doesn't eat vertical space on small screens. */}
      <div className={`fdrawer__overlay${drawerOpen ? " open" : ""}`} onClick={() => setDrawerOpen(false)} />
      <div className={`fdrawer${drawerOpen ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Filters">
        <div className="fdrawer__head">
          <b>Filters</b>
          <button type="button" className="fdrawer__x" aria-label="Close" onClick={() => setDrawerOpen(false)}><Icon name="x" size={18} /></button>
        </div>
        <div className="fdrawer__body">
          <div className="fdrawer__label">Genre</div>
          <div className="chip-row">
            <button className={`fchip${genre === "All" ? " on" : ""}`} onClick={() => setGenre("All")}>All</button>
            {GENRES.map((g) => (
              <button key={g} className={`fchip${genre === g ? " on" : ""}`} onClick={() => setGenre(g)}>{g}</button>
            ))}
          </div>
          <div className="fdrawer__label">Sort By</div>
          <div className="chip-row">
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <button key={s} className={`fchip${sort === s ? " on" : ""}`} onClick={() => setSort(s)}>{SORT_LABEL[s]}</button>
            ))}
          </div>
        </div>
        <div className="fdrawer__foot">
          <button type="button" className="btn btn--ghost" onClick={() => { setGenre("All"); setSort(defaultSort); }}>Reset</button>
          <button type="button" className="btn btn--play" onClick={() => setDrawerOpen(false)}>Apply</button>
        </div>
      </div>

      {results.length ? (
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
      ) : loading ? (
        <div className="grid">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="skel" />)}</div>
      ) : (
        <div className="empty">No titles match your filters.</div>
      )}
    </>
  );
}
