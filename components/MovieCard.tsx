"use client";

import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { poster } from "@/lib/images";

export interface MovieCardProps {
  movie: Movie;
  rank?: number;
  badge?: string;
  progress?: number;
  note?: string;
}

export default function MovieCard({ movie, rank, badge, progress, note }: MovieCardProps) {
  return (
    <Link className="mcard" href={`/movie/${movie.id}`} aria-label={movie.title}>
      {rank ? <span className="mcard__rank">{rank}</span> : null}
      <div className="mcard__poster">
        <Image
          fill
          alt={`${movie.title}${movie.year ? ` (${movie.year})` : ""} poster`}
          src={poster(movie)}
          sizes="(max-width: 760px) 26vw, 172px"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
        />
        <span className="mcard__rate"><Icon name="star" size={11} /> {movie.rating.toFixed(1)}</span>
        {badge ? <span className="mcard__badge">{badge}</span> : null}
        <div className="mcard__pop">
          <div className="mcard__acts">
            <span className="mcard__ab mcard__ab--play" aria-hidden="true"><Icon name="play" size={15} /></span>
            <span className="mcard__ab mcard__ab--info" aria-hidden="true"><Icon name="info" size={15} /></span>
          </div>
          <div className="mcard__pt">{movie.title}</div>
          <div className="mcard__pm">
            <span>{movie.year || "—"}</span>{movie.genres[0] && <><span>•</span><span>{movie.genres[0]}</span></>}
            <span className="r"><Icon name="star" size={11} /> {movie.rating.toFixed(1)}</span>
          </div>
          <div className="mcard__pd">{movie.desc}</div>
        </div>
        {progress ? <div className="mcard__prog"><span style={{ width: `${progress}%` }} /></div> : null}
      </div>
      <div className="mcard__name">{movie.title}</div>
      <div className={note ? "mcard__note" : "mcard__sub"}>{note ?? [movie.year || null, movie.genres[0] || null].filter(Boolean).join(" · ")}</div>
    </Link>
  );
}
