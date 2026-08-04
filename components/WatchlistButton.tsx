"use client";

import Icon from "./Icon";
import { useWatchlist } from "@/lib/watchlist";

export default function WatchlistButton({ id, variant = "button" }: { id: string; variant?: "button" | "save" }) {
  const { has, toggle } = useWatchlist();
  const inWL = has(id);
  if (variant === "save") {
    return (
      <button className={`dposter__save${inWL ? " on" : ""}`} aria-pressed={inWL} aria-label="Save"
        onClick={(e) => { e.preventDefault(); toggle(id); }}><Icon name="bookmark" size={16} /></button>
    );
  }
  return (
    <button className={`btn btn--ghost${inWL ? " on" : ""}`} aria-pressed={inWL} onClick={() => toggle(id)}>
      <Icon name="bookmark" size={16} /> <span>{inWL ? "In Watchlist" : "Add to Watchlist"}</span>
    </button>
  );
}
