"use client";

export interface PlayRequest {
  title?: string;
  /** Catalogue slug or "tmdb-m-123" — used to look the trailer up. */
  movieId?: string;
  /** YouTube key, when we already know it (skips the lookup). */
  trailerKey?: string | null;
  /** "trailer" plays the real trailer; "watch" falls back to the sample stream. */
  mode?: "trailer" | "watch";
}

/** Global player-modal signal. Any play button fires this; PlayerModal listens. */
export function openPlayer(req: PlayRequest | string = {}) {
  if (typeof window === "undefined") return;
  const detail: PlayRequest = typeof req === "string" ? { title: req } : req;
  window.dispatchEvent(new CustomEvent("moviex:play", { detail }));
}
