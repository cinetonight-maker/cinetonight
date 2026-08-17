"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { openPlayer } from "@/lib/player";
import { tmdb, img } from "@/lib/images";
import type { SeasonInfo, EpisodeInfo } from "@/lib/tmdb";

/** Season & episode picker for a series' detail page. Pick a season →
 *  episodes load live from TMDB (via /api/tv/<id>) → tapping an episode
 *  opens the trailer player with the best video available for it (the
 *  episode's own trailer/teaser when TMDB has one, else the season's, else
 *  the show's — resolved server-side in one call). Episode lists are
 *  cached per season in-memory so switching back is instant. */
/** Episodes revealed per batch, and per "Load more" tap. */
const EPISODE_BATCH = 5;

export default function EpisodePicker({
  tvId, showTitle, seasons, fallbackTrailerKey = null,
}: {
  tvId: number;
  showTitle: string;
  seasons: SeasonInfo[];
  fallbackTrailerKey?: string | null;
}) {
  const [season, setSeason] = useState(seasons[0]?.season ?? 1);
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [playingEp, setPlayingEp] = useState<number | null>(null);
  /** Episodes are revealed in batches rather than all at once: a 24-episode
   *  season rendered in full is a wall of images and markup on a phone, and
   *  every still is a network request. Five is enough to see what the season
   *  looks like, and "Load more" is one tap away. */
  const [shownCount, setShownCount] = useState(EPISODE_BATCH);
  const cacheRef = useRef<Record<number, EpisodeInfo[]>>({});
  const reqRef = useRef(0);

  useEffect(() => {
    setShownCount(EPISODE_BATCH); // a new season starts from the first batch
    const cached = cacheRef.current[season];
    if (cached) { setEpisodes(cached); setLoading(false); setError(false); return; }
    const mine = ++reqRef.current;
    setLoading(true);
    setError(false);
    fetch(`/api/tv/${tvId}?season=${season}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((d) => {
        if (mine !== reqRef.current) return;
        const eps: EpisodeInfo[] = d.episodes ?? [];
        cacheRef.current[season] = eps;
        setEpisodes(eps);
        setLoading(false);
      })
      .catch(() => { if (mine === reqRef.current) { setEpisodes([]); setLoading(false); setError(true); } });
  }, [tvId, season]);

  async function playEpisode(ep: EpisodeInfo) {
    setPlayingEp(ep.episode);
    let key: string | null = null;
    try {
      const r = await fetch(`/api/tv/${tvId}?season=${season}&episode=${ep.episode}`);
      if (r.ok) key = (await r.json()).key ?? null;
    } catch { /* fall through to the show trailer below */ }
    setPlayingEp(null);
    openPlayer({
      title: `${showTitle} — S${season} E${ep.episode} · ${ep.name}`,
      trailerKey: key ?? fallbackTrailerKey,
      mode: "trailer",
    });
  }

  if (!seasons.length) return null;

  return (
    <section className="sec">
      <div className="sec__head">
        <div className="sec__titles">
          <h2>Seasons &amp; Episodes</h2>
          <p className="sec__sub">Pick a season, tap an episode to watch its trailer</p>
        </div>
      </div>

      <div className="seasonbar" role="tablist" aria-label="Seasons">
        {seasons.map((s) => (
          <button
            key={s.season}
            type="button"
            role="tab"
            aria-selected={s.season === season}
            className={`seasonbar__pill${s.season === season ? " on" : ""}`}
            onClick={() => setSeason(s.season)}
          >
            {s.name.length <= 10 ? s.name : `Season ${s.season}`}
            <span className="seasonbar__n">{s.episodeCount} ep</span>
          </button>
        ))}
      </div>

      {loading && <div className="eplist__msg">Loading episodes…</div>}
      {error && !loading && <div className="eplist__msg">Couldn&apos;t load episodes. Try again in a moment.</div>}

      {!loading && !error && episodes.length > 0 && (
        <div className="eplist">
          {episodes.slice(0, shownCount).map((ep) => (
            <button
              key={ep.episode}
              type="button"
              className="epc"
              onClick={() => playEpisode(ep)}
              disabled={playingEp !== null}
            >
              <span className="epc__num">{ep.episode}</span>
              <span className="epc__still">
                <Image
                  fill
                  alt=""
                  src={tmdb(ep.stillPath, "w300") ?? img(`ep-${tvId}-${season}-${ep.episode}`, 300, 170)}
                  sizes="120px"
                />
                <span className="epc__play">
                  {playingEp === ep.episode ? <span className="epc__spin" /> : <Icon name="play" size={14} />}
                </span>
              </span>
              <span className="epc__meta">
                <span className="epc__t">{ep.name}</span>
                <span className="epc__sub">
                  {[ep.airDate ? ep.airDate.slice(0, 4) : null, ep.runtime ? `${ep.runtime}m` : null]
                    .filter(Boolean).join(" · ") || "—"}
                </span>
                {ep.overview && <span className="epc__x">{ep.overview}</span>}
              </span>
              <span className="epc__go"><Icon name="chevr" size={16} /></span>
            </button>
          ))}
        </div>
      )}

      {!loading && !error && episodes.length > shownCount && (
        <div className="eplist__more">
          <button
            type="button"
            className="eplist__morebtn"
            onClick={() => setShownCount((n) => n + EPISODE_BATCH)}
          >
            Load more episodes
            <span className="eplist__morecount">
              {Math.min(EPISODE_BATCH, episodes.length - shownCount)} more of {episodes.length}
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
