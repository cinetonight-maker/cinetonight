"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MovieCard from "../MovieCard";
import { track } from "@/lib/analytics";
import type { CardMovie } from "@/lib/types";

/** Explore Tonight — one compact tabbed block, Phase 3 locked tabs.
 *
 *  COST DESIGN:
 *  - "For You" (default) is FREE: the server blends it from already-cached
 *    industry pools (see app/page.tsx + lib/industry.mixDiscovery) and ships
 *    it inside the cached homepage HTML. Zero client fetches until a user
 *    actually taps another tab.
 *  - The five industry tabs load ON INTERACTION from /api/explore — a
 *    closed set of exactly five URLs, each edge-cached, each fetched at
 *    most once per visit and then kept in memory. No all-tab prefetch.
 *  - Tab state is local, never in the URL — no crawlable filter inventory.
 *  - Every tab's data passed Phase 2 discoveryFilter on the server. */

type TabId = "for-you" | "hollywood" | "bollywood" | "south" | "korean" | "international";

const TABS: { id: TabId; label: string; href: string }[] = [
  // View-all targets reuse existing controlled browse pages; industry-level
  // browse pages are future Discover work (Phase 4/6), so those tabs point
  // at the closest existing page rather than minting new routes now.
  // Label "Tonight Mix", not "For You": this feed is a shared editorial-style
  // blend, identical for every visitor — the UI must not imply
  // personalization that does not exist. Internal id stays "for-you" to
  // avoid churn (it never leaves the client).
  { id: "for-you", label: "Tonight Mix", href: "/trending" },
  { id: "hollywood", label: "Hollywood", href: "/movies" },
  { id: "bollywood", label: "Bollywood", href: "/movies" },
  { id: "south", label: "South Indian", href: "/movies" },
  { id: "korean", label: "Korean", href: "/tv-shows" },
  { id: "international", label: "International", href: "/trending" },
];

export interface ExploreTabsProps {
  mixed: CardMovie[];
  /** Which tabs to offer, their labels and order, and which opens first —
   *  from the dashboard. Ids are NOT configurable: they are part of the
   *  /api/explore cache key. Absent = the shipped set. */
  tabs?: { id: string; label: string }[];
  defaultTab?: string;
}

export default function ExploreTabs({ mixed, tabs: configured, defaultTab }: ExploreTabsProps) {
  // Which tab opens first is configurable; it always falls back to a real
  // tab id, so a stale setting can never open on nothing.
  const [tab, setTab] = useState<TabId>(
    (defaultTab && TABS.some((t) => t.id === defaultTab) ? defaultTab : "for-you") as TabId,
  );
  const [lazy, setLazy] = useState<Partial<Record<TabId, CardMovie[]>>>({});
  const [loading, setLoading] = useState(false);
  const fetched = useRef<Set<TabId>>(new Set());

  const load = useCallback(async (id: TabId) => {
    if (id === "for-you" || fetched.current.has(id)) return;
    fetched.current.add(id);
    setLoading(true);
    try {
      const res = await fetch(`/api/explore?tab=${id}`);
      const data = res.ok ? await res.json() : null;
      if (data?.results) setLazy((prev) => ({ ...prev, [id]: data.results.slice(0, 10) }));
    } catch {
      /* a failed tab shows its empty state; the rest of the page is unaffected */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);

  // Labels and order come from the dashboard; the ids and their "view all"
  // targets stay here, because those are part of the routing and the cache.
  const shown = configured?.length
    ? configured
        .map((c) => { const t = TABS.find((x) => x.id === c.id); return t ? { ...t, label: c.label } : null; })
        .filter((t): t is (typeof TABS)[number] => !!t)
    : TABS;

  const items: CardMovie[] = tab === "for-you" ? mixed : lazy[tab] ?? [];
  const active = shown.find((t) => t.id === tab) ?? shown[0] ?? TABS[0];

  return (
    <section className="sec" aria-labelledby="explore-h">
      <div className="sec__head">
        <div className="sec__titles">
          <h2 id="explore-h">Explore Tonight</h2>
          <p className="sec__sub">A short list from every corner of cinema</p>
        </div>
        <Link className="sec__all" href={active.href}>View all</Link>
      </div>

      <div className="etabs" role="tablist" aria-label="Explore by industry">
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`etab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="etab-panel"
            className={`etab${t.id === tab ? " on" : ""}`}
            onClick={() => { setTab(t.id); track("explore_tab", { tab: t.id, surface: "homepage" }); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="egrid" id="etab-panel" role="tabpanel" aria-labelledby={`etab-${tab}`}>
        {items.length > 0
          ? items.slice(0, 8).map((m) => <MovieCard key={m.id} movie={m} />)
          : (
            <p className="etabs__empty">
              {loading ? "Loading…" : <>Nothing to show here right now. <Link href={active.href}>Browse more</Link>.</>}
            </p>
          )}
      </div>
    </section>
  );
}
