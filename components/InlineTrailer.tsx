"use client";

import Image from "next/image";
import { useState } from "react";
import Icon from "./Icon";
import { backdrop, posterLg } from "@/lib/images";
import type { Movie } from "@/lib/types";

/** Inline trailer banner at the top of a movie page — the reference-mock
 *  pattern: a wide 16:9 backdrop with a centered play button that swaps to
 *  the YouTube player IN PLACE when tapped. No fullscreen takeover, no
 *  modal — the visitor keeps the whole page (cast, where-to-watch,
 *  related) in reach while the trailer runs. The trailer key is usually
 *  already on the movie; when it isn't, one call to /api/trailer resolves
 *  it on demand. */
export default function InlineTrailer({ movie, compact = false, gallery = false }: {
  movie: Pick<Movie, "id" | "title" | "backdropPath" | "posterPath" | "trailerKey" | "clips">;
  /** Small hero-thumbnail rendering (v2m-hero__trailer): same click-to-embed
   *  behavior, smaller play control, no clips row (that picker belongs to
   *  the full "Trailer & Clips" section further down the page, not a
   *  hero-sized preview). */
  compact?: boolean;
  /** "Trailers & Videos" section rendering (v2m-trailer-row): thumbnail
   *  cards (real YouTube thumbnails, no extra request) instead of the
   *  banner's text-pill row - same underlying play/playClip state, just a
   *  different picker UI for a dedicated video gallery further down the
   *  page (the hero banner above only ever shows the one main trailer). */
  gallery?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [key, setKey] = useState<string | null>(movie.trailerKey ?? null);
  /** Which extra video is showing, so the row can mark it. Null = trailer. */
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const clips = movie.clips ?? [];
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

  /** Swap the embedded video without leaving the page. */
  function playClip(clipKey: string) {
    setKey(clipKey);
    setActiveClip(clipKey);
    setPlaying(true);
  }

  return (
    <>
    <div className={`itrailer${compact ? " itrailer--compact" : ""}`}>
      {playing && key ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${key}?autoplay=1&rel=0&modestbranding=1`}
          title={`${movie.title} - official trailer`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <>
          {/* Most of the long tail has no backdrop on TMDB, and backdrop()
              then returns the shared /placeholder-wide.png - a grey rectangle
              behind the play button on the majority of pages. The title's own
              poster, blown up and blurred, is art from THIS film and needs no
              extra request. */}
          <Image
            className={movie.backdropPath ? undefined : "itrailer__fromposter"}
            fill
            priority
            alt={`${movie.title} backdrop`}
            src={movie.backdropPath ? backdrop(movie, "w1280") : posterLg(movie)}
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

    {/* CLIPS. These come from the same TMDB response as the trailer, so the
        row costs no extra request. Buttons, not links: they swap the player
        above rather than sending anyone to YouTube. Hero thumbnail skips
        this - a picker belongs with the full player, not a small preview.
        Two picker UIs share the same play/playClip state: a text-pill row
        (default, the old "Trailer & Clips" section) or a thumbnail grid
        (gallery - v2m-trailer-row's "Trailers & Videos"). */}
    {!compact && gallery && (movie.trailerKey || clips.length > 0) && (
      <div className="vgrid" role="group" aria-label="Trailers and videos">
        {movie.trailerKey && (
          <button
            type="button"
            className={`vgrid__item${activeClip === null ? " on" : ""}`}
            onClick={() => { setKey(movie.trailerKey ?? null); setActiveClip(null); setPlaying(true); }}
          >
            <span className="vgrid__th">
              <img loading="lazy" alt="" src={`https://img.youtube.com/vi/${movie.trailerKey}/hqdefault.jpg`} />
              <span className="vgrid__play" aria-hidden="true"><Icon name="play" size={16} /></span>
            </span>
            <span className="vgrid__t">Official Trailer</span>
          </button>
        )}
        {clips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`vgrid__item${activeClip === c.key ? " on" : ""}`}
            onClick={() => playClip(c.key)}
          >
            <span className="vgrid__th">
              <img loading="lazy" alt="" src={`https://img.youtube.com/vi/${c.key}/hqdefault.jpg`} />
              <span className="vgrid__play" aria-hidden="true"><Icon name="play" size={16} /></span>
            </span>
            <span className="vgrid__t">{c.name || c.type}</span>
          </button>
        ))}
      </div>
    )}
    {!compact && !gallery && clips.length > 0 && (
      <div className="clips" role="group" aria-label="More videos">
        <button
          type="button"
          className={`clips__b${activeClip === null ? " on" : ""}`}
          onClick={() => { setKey(movie.trailerKey ?? null); setActiveClip(null); if (movie.trailerKey) setPlaying(true); }}
        >
          <span className="clips__t">Trailer</span>
        </button>
        {clips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`clips__b${activeClip === c.key ? " on" : ""}`}
            onClick={() => playClip(c.key)}
            title={c.name}
          >
            <span className="clips__k">{c.type}</span>
            <span className="clips__t">{c.name}</span>
          </button>
        ))}
      </div>
    )}
    </>
  );
}
