"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "moviex:watchlist";
const EVENT = "moviex:wl-change";

export function readWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function toggleWatchlist(id: string): boolean {
  const list = readWatchlist();
  const i = list.indexOf(id);
  const added = i === -1;
  if (added) list.push(id);
  else list.splice(i, 1);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(EVENT));
  return added;
}

/** Reactive watchlist synced across components + browser tabs. */
export function useWatchlist() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(readWatchlist());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return { ids, has, toggle: toggleWatchlist, count: ids.length };
}
