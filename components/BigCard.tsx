"use client";

import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { backdrop } from "@/lib/images";

/** Wide "spotlight" card — a bigger, widescreen alternative to the standard
 *  poster MovieCard, for the handful of places (home spotlight row, search's
 *  trending picks) that want one or two titles to stand out visually rather
 *  than blend into a dense grid. */
export default function BigCard({ movie, eyebrow }: { movie: Movie; eyebrow?: string }) {
  return (
    <Link className="bigcard" href={`/movie/${movie.id}`}>
      <div className="bigcard__img">
        <Image
          fill
          alt={`${movie.title}${movie.year ? ` (${movie.year})` : ""}`}
          src={backdrop(movie)}
          sizes="(max-width: 760px) 82vw, 420px"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
        />
        <div className="bigcard__scrim" />
        {eyebrow ? <span className="bigcard__eyebrow">{eyebrow}</span> : null}
        <span className="bigcard__rate"><Icon name="star" size={12} /> {movie.rating.toFixed(1)}</span>
        <div className="bigcard__body">
          <div className="bigcard__t">{movie.title}</div>
          <div className="bigcard__m">{[movie.year || null, movie.genres[0] || null].filter(Boolean).join(" · ")}</div>
        </div>
      </div>
    </Link>
  );
}
