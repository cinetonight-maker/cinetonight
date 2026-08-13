"use client";

/** Recent-searches memory — localStorage only (no account needed, nothing
 *  sent anywhere), newest first, deduped, capped. SearchBox records every
 *  search/suggestion click; the search page shows the chips. The custom
 *  event keeps any mounted chip list live-updating in the same tab
 *  (the `storage` event only fires across OTHER tabs). */
const KEY = "moviex:recent-searches";
const EVENT = "moviex:recent-searches-change";
const MAX = 8;

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(term: string) {
  const q = term.trim();
  if (q.length < 2 || typeof window === "undefined") return;
  const next = [q, ...getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full/blocked — not worth breaking search over */ }
  window.dispatchEvent(new Event(EVENT));
}

export function removeRecentSearch(term: string) {
  if (typeof window === "undefined") return;
  const next = getRecentSearches().filter((s) => s !== term);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function onRecentSearchesChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
