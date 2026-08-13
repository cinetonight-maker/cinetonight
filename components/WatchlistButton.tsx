"use client";

import Icon from "./Icon";
import { useWatchlist } from "@/lib/watchlist";

export default function WatchlistButton({ id }: { id: string }) {
  const { has, toggle } = useWatchlist();
  const inWL = has(id);
  return (
    <button className={`btn btn--ghost${inWL ? " on" : ""}`} aria-pressed={inWL} onClick={() => toggle(id)}>
      <Icon name="bookmark" size={16} /> <span>{inWL ? "In Watchlist" : "Add to Watchlist"}</span>
    </button>
  );
}
