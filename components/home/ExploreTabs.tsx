"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MovieCard from "../MovieCard";
import { track } from "@/lib/analytics";
import type { CardMovie } from "@/lib/types";

/** One compact browse block instead of a dozen catalogue shelves.
 *
 *  COST DESIGN:
 *  - The Films and Series tabs are FREE. Both are sliced on the server from
 *    the single shared trending fetch the page already makes, and both ship
 *    inside the cached HTML, so switching between them costs nothing at all.
 *  - New Releases and Top Rated load on demand from /api/browse, which is
 *    force-dynamic and therefore writes no page-cache entry. Each is fetched
 *    at most once per visit and then kept in memory.
 *  - Tab state is local. It never touches the URL, so no filter combination
 *    can become crawlable inventory. */

type TabId = "movies" | "series" | "new" | "top";

const TABS: { id: TabId; label: string; href: string }[] = [
  { id: "movies", label: "Films", href: "/movies" },
  { id: "series", label: "Series", href: "/tv-shows" },
  { id: "new", label: "New Releases", href: "/latest" },
  { id: "top", label: "Top Rated", href: "/trending" },
];

export default function ExploreTabs({ movies, series }: { movies: CardMovie[]; series: CardMovie[] }) {
  const [tab, setTab] = useState<TabId>("movies");
  const [lazy, setLazy] = useState<Partial<Record<TabId, CardMovie[]>>>({});
  const [loading, setLoading] = useState(false);
  const fetched = useRef<Set<TabId>>(new Set());

  const load = useCallback(async (id: TabId) => {
    // Films/Series are free when the server-rendered slice has content.
    // BUT global trending skews heavily to films, so the Series slice can
    // arrive thin or empty - in that case fetch real series from /api/browse
    // instead of showing "Nothing to show" for a category that obviously
    // has content. Same guard for Films, for symmetry.
    const ssrHas = id === "movies" ? movies.length > 0 : id === "series" ? series.length > 0 : false;
    if (ssrHas || fetched.current.has(id)) return;
    fetched.current.add(id);
    setLoading(true);
    const q =
      id === "new" ? "kind=all&sort=year"
      : id === "top" ? "kind=all&sort=rating"
      : id === "series" ? "kind=series&sort=trending"
      : "kind=movie&sort=trending";
    try {
      const res = await fetch(`/api/browse?${q}&page=1`);
      const data = res.ok ? await res.json() : null;
      if (data?.results) setLazy((prev) => ({ ...prev, [id]: data.results.slice(0, 8) }));
    } catch {
      /* a failed tab shows its empty state; the rest of the page is unaffected */
    } finally {
      setLoading(false);
    }
  }, [movies.length, series.length]);

  useEffect(() => { load(tab); }, [tab, load]);

  const items: CardMovie[] =
    tab === "movies" ? (movies.length ? movies : lazy.movies ?? [])
    : tab === "series" ? (series.length ? series : lazy.series ?? [])
    : lazy[tab] ?? [];
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <section className="sec" aria-labelledby="explore-h">
      <div className="sec__head">
        <div className="sec__titles">
          <h2 id="explore-h">Explore Tonight</h2>
          <p className="sec__sub">A short list from each corner of the catalogue</p>
        </div>
        <Link className="sec__all" href={active.href}>View all</Link>
      </div>

      <div className="etabs" role="tablist" aria-label="Explore categories">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`etab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="etab-panel"
            className={`etab${t.id === tab ? " on" : ""}`}
            onClick={() => { setTab(t.id); track("explore_tab", { tab: t.id }); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Its own grid, not the shared .grid: this block always holds eight
          items, and a fixed four-across layout keeps that as two clean rows
          instead of seven cards plus a lonely eighth on a second row. */}
      <div className="egrid" id="etab-panel" role="tabpanel" aria-labelledby={`etab-${tab}`}>
        {items.length > 0
          ? items.map((m) => <MovieCard key={m.id} movie={m} />)
          : (
            <p className="etabs__empty">
              {loading ? "Loading…" : <>Nothing to show here right now. <Link href={active.href}>Browse {active.label.toLowerCase()}</Link>.</>}
            </p>
          )}
      </div>
    </section>
  );
}
