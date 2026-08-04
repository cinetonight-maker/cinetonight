"use client";

import Icon from "./Icon";
import { openPlayer } from "@/lib/player";
import type { Movie } from "@/lib/types";

export default function PlayButton({
  movie,
  label = "Watch Now",
  icon = "play",
  className = "btn btn--play",
  mode = "watch",
}: {
  movie: Pick<Movie, "id" | "title" | "trailerKey">;
  label?: string;
  icon?: string;
  className?: string;
  mode?: "watch" | "trailer";
}) {
  return (
    <button
      className={className}
      onClick={() => openPlayer({ title: movie.title, movieId: movie.id, trailerKey: movie.trailerKey, mode })}
    >
      <Icon name={icon} size={className.includes("plat__btn") ? 13 : 16} /> {label}
    </button>
  );
}
