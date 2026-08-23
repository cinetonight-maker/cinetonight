"use client";

import Icon from "./Icon";
import { useWatchlist } from "@/lib/watchlist";
import { trackWatchlistAdded, trackWatchlistRemoved, toMediaType, type Surface } from "@/lib/analytics";
import { parseTmdbId } from "@/lib/tmdb";

export default function WatchlistButton({ id, surface = "unknown", kind }: { id: string; surface?: Surface; kind?: string }) {
  const { has, toggle } = useWatchlist();
  const inWL = has(id);
  // The event fires from toggle's onConfirmed callback - i.e. only after the
  // save actually succeeded (immediately for anonymous localStorage, after
  // the Supabase write resolves for signed-in users). A failed remote save
  // rolls back silently and reports nothing.
  const meta = {
    surface,
    media_type: toMediaType(kind ?? parseTmdbId(id)?.kind),
    tmdb_id: parseTmdbId(id)?.id,
  };
  return (
    <button
      className={`btn btn--ghost${inWL ? " on" : ""}`}
      aria-pressed={inWL}
      onClick={() => toggle(id, (added) => (added ? trackWatchlistAdded(meta) : trackWatchlistRemoved(meta)))}
    >
      <Icon name="bookmark" size={16} /> <span>{inWL ? "In Watchlist" : "Add to Watchlist"}</span>
    </button>
  );
}
