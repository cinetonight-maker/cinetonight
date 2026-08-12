"use client";

import Icon from "./Icon";
import { openPlayer } from "@/lib/player";
import type { Movie } from "@/lib/types";

/** The single, best-of-breed "Where to Watch" strip on a movie's detail
 *  page — see MovieDetail.tsx for why this replaced a five-platform grid.
 *  This is affiliate real estate, so the whole strip is one big click
 *  target (not just a small button inside it) and opens the same trailer
 *  player Watch Now does, since the site doesn't host real playback. */
export default function PlatformStrip({
  movie, name, desc, color,
}: { movie: Pick<Movie, "id" | "title" | "trailerKey">; name: string; desc: string; color: string }) {
  return (
    <button
      type="button"
      className="platstrip"
      onClick={() => openPlayer({ title: movie.title, movieId: movie.id, trailerKey: movie.trailerKey, mode: "trailer" })}
    >
      <span
        className="platstrip__logo"
        style={{
          background: `color-mix(in srgb,${color} 22%,#15151f)`,
          color,
          border: `1px solid color-mix(in srgb,${color} 50%,transparent)`,
        }}
      >
        {name[0]}
      </span>
      <span className="platstrip__body">
        <span className="platstrip__name">Watch on {name}</span>
        <span className="platstrip__desc">{desc}</span>
      </span>
      <span className="platstrip__cta"><Icon name="play" size={15} /> Watch Now</span>
    </button>
  );
}
