"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import { getRecentSearches, removeRecentSearch, clearRecentSearches, onRecentSearchesChange } from "@/lib/recentSearches";

/** Chips of the visitor's recent searches, shown under the search page's
 *  bar. Renders nothing until mounted (localStorage is browser-only, so
 *  server HTML must not guess at it) and nothing when there's no history. */
export default function RecentSearches() {
  const router = useRouter();
  const [items, setItems] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setItems(getRecentSearches());
    return onRecentSearchesChange(() => setItems(getRecentSearches()));
  }, []);

  if (!mounted || !items.length) return null;

  return (
    <div className="recentbar" aria-label="Recent searches">
      <span className="recentbar__label"><Icon name="search" size={12} /> Recent:</span>
      {items.map((q) => (
        <span className="recentbar__chip" key={q}>
          <button type="button" className="recentbar__go" onClick={() => router.push(`/search?q=${encodeURIComponent(q)}`)}>
            {q}
          </button>
          <button type="button" className="recentbar__x" aria-label={`Remove "${q}" from recent searches`} onClick={() => removeRecentSearch(q)}>
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
      <button type="button" className="recentbar__clear" onClick={clearRecentSearches}>Clear all</button>
    </div>
  );
}
