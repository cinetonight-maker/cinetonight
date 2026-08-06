"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { heroArt, poster } from "@/lib/images";
import { openPlayer } from "@/lib/player";

/** Auto-rotating hero. Slides are chosen in /admin (content/site.json → hero.slides). */
export default function Hero({ slides, intervalMs = 6000 }: { slides: Movie[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = slides.length;

  const go = useCallback((next: number) => { if (n) setI(((next % n) + n) % n); }, [n]);

  // Auto-carousel always runs — reduced-motion users still get the slides
  // advancing (movie-relevant backdrop swaps each time), just without the
  // crossfade/slide-in animation (handled separately in CSS).
  useEffect(() => {
    if (n <= 1 || paused) return;
    timer.current = setInterval(() => setI((p) => (p + 1) % n), intervalMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [n, paused, intervalMs]);

  if (!n) return null;
  const m = slides[i];
  const [main, ...rest] = m.title.split(":");

  return (
    <section
      className="hero hero--slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      {slides.map((s, idx) => (
        <Image
          key={s.id}
          fill
          alt=""
          src={heroArt(s)}
          className={`hero__bgimg${idx === i ? " on" : ""}`}
          aria-hidden={idx !== i}
          sizes="100vw"
          priority={idx === 0}
        />
      ))}
      <div className="hero__scrim" />

      <div className="hero__c" key={m.id}>
        <div className="hero__ey">
          {m.kind === "series" ? "Featured · Web Series" : "Featured · Film"}
          {m.genres[0] ? ` · ${m.genres[0]}` : ""}
        </div>
        <div className="hero__t">{main}</div>
        <div className={`hero__sub${rest.length ? "" : " hero__sub--empty"}`}>{rest.join(":").trim()}</div>
        <p className="hero__desc">{m.desc}</p>
        <div className="hero__tags">
          <span className="hero__rate"><Icon name="star" size={12} /> {m.rating.toFixed(1)}</span>
          {m.year ? <span>{m.year}</span> : null}
          {m.language ? <span>{m.language}</span> : null}
          {m.runtime && m.runtime !== "—" ? <span>{m.runtime}</span> : null}
          {m.genres.length ? <span>{m.genres.join(", ")}</span> : null}
        </div>
        <div className="hero__btns">
          <button className="btn btn--play" onClick={() => openPlayer({ title: m.title, movieId: m.id, trailerKey: m.trailerKey, mode: "trailer" })}>
            <Icon name="play" size={16} /> Watch Now
          </button>
          <Link className="btn btn--ghost" href={`/movie/${m.id}`}><Icon name="info" size={16} /> More Info</Link>
        </div>
      </div>

      {n > 1 && (
        <>
          <button className="hero__nav hero__nav--l" aria-label="Previous" onClick={() => go(i - 1)}>
            <Icon name="chevl" size={20} />
          </button>
          <button className="hero__nav hero__nav--r" aria-label="Next" onClick={() => go(i + 1)}>
            <Icon name="chevr" size={20} />
          </button>
          <div className="hero__thumbs">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                className={`hero__thumb${idx === i ? " on" : ""}`}
                aria-label={`Show ${s.title}`}
                aria-current={idx === i}
                onClick={() => go(idx)}
              >
                <Image fill alt="" src={poster(s)} sizes="44px" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
