"use client";

import Image from "next/image";
import { useState } from "react";
import Icon from "./Icon";
import { backdrop } from "@/lib/images";
import type { Movie } from "@/lib/types";

/** Inline trailer banner at the top of a movie page — the reference-mock
 *  pattern: a wide 16:9 backdrop with a centered play button that swaps to
 *  the YouTube player IN PLACE when tapped. No fullscreen takeover, no
 *  modal — the visitor keeps the whole page (cast, where-to-watch,
 *  related) in reach while the trailer runs. The trailer key is usually
 *  already on the movie; when it isn't, one call to /api/trailer resolves
 *  it on demand. */
export default function InlineTrailer({ movie }: { movie: Pick<Movie, "id" | "title" | "backdropPath" | "posterPath" | "trailerKey"> }) {
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState<string | null>(movie.trailerKey ?? null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function play() {
    if (key) { setPlaying(true); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/trailer?id=${encodeURIComponent(movie.id)}`);
      const data = res.ok ? await res.json() : { key: null };
      if (data.key) { setKey(data.key); setPlaying(true); }
      else setUnavailable(true);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="itrailer">
      {playing && key ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&modestbranding=1`}
          title={`${movie.title} — official trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <>
          <Image
            fill
            priority
            alt={`${movie.title} backdrop`}
            src={backdrop(movie, "w1280")}
            sizes="(max-width: 900px) 100vw, 860px"
          />
          <span className="itrailer__scrim" />
          <button type="button" className="itrailer__play" onClick={play} disabled={loading} aria-label={`Play ${movie.title} trailer`}>
            {loading ? <span className="itrailer__spin" /> : <Icon name="play" size={26} />}
          </button>
          {unavailable && <span className="itrailer__label">Trailer unavailable right now</span>}
        </>
      )}
    </div>
  );
}
