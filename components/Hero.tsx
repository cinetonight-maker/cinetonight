"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { posterLg } from "@/lib/images";

/** Auto-rotating hero. Slides are chosen in /admin (content/site.json → hero.slides).
 *  Minimal by design: each slide is that title's own poster as a full-bleed
 *  background (no blended/backdrop collage), title + a one-line rating/year/
 *  genre readout, and dot pagination — no description paragraph, no
 *  Watch Now / More Info buttons, no boxed card chrome. Tapping the title
 *  area still opens the movie's detail page.
 *
 *  Only ONE background image is ever in the DOM at a time — keyed by movie
 *  id, so React unmounts the old one and mounts a fresh one on every slide
 *  change instead of stacking every slide's image and toggling opacity.
 *
 *  IMPORTANT: the <Image> and the <Link> below must NOT share the same key
 *  value. They did at one point (both keyed by `m.id`), and because React
 *  matches reconciliation identity by key WITHIN A SET OF SIBLINGS regardless
 *  of element type, giving two different sibling elements the same key
 *  confused the diff — the old <img> from the previous slide was never
 *  actually unmounted, it just kept accumulating a new absolutely-positioned
 *  poster on top with every slide change (confirmed with a MutationObserver:
 *  "ADDED" on every change, "REMOVED" never). That's what showed as the
 *  previous movie's poster still visible underneath the current one. Each
 *  keyed element here now has its own distinct key. */
export default function Hero({ slides, intervalMs = 6000 }: { slides: Movie[]; intervalMs?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const n = slides.length;

  const go = useCallback((next: number) => { if (n) setI(((next % n) + n) % n); }, [n]);

  // Auto-carousel always runs — reduced-motion users still get the slides
  // advancing (each slide's own poster swaps in), just without the
  // crossfade/slide-in animation (handled separately in CSS).
  useEffect(() => {
    if (n <= 1 || paused) return;
    timer.current = setInterval(() => setI((p) => (p + 1) % n), intervalMs);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [n, paused, intervalMs]);

  if (!n) return null;
  const m = slides[i];

  return (
    <section
      className="hero hero--slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <Image
        key={`img-${m.id}`}
        fill
        alt=""
        src={posterLg(m)}
        className="hero__bgimg"
        sizes="100vw"
        priority
      />
      <div className="hero__scrim" />

      <Link className="hero__c" key={`link-${m.id}`} href={`/movie/${m.id}`}>
        <div className="hero__t">{m.title}</div>
        <div className="hero__meta">
          <span className="hero__rate"><Icon name="star" size={12} /> {m.rating.toFixed(1)}</span>
          {m.year ? <span>{m.year}</span> : null}
          {m.genres[0] ? <span>{m.genres[0]}</span> : null}
        </div>
      </Link>

      {n > 1 && (
        <>
          <button className="hero__nav hero__nav--l" aria-label="Previous" onClick={() => go(i - 1)}>
            <Icon name="chevl" size={20} />
          </button>
          <button className="hero__nav hero__nav--r" aria-label="Next" onClick={() => go(i + 1)}>
            <Icon name="chevr" size={20} />
          </button>
          <div className="hero__dots" role="tablist" aria-label="Slides">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                className={`hero__dot${idx === i ? " on" : ""}`}
                role="tab"
                aria-label={`Show ${s.title}`}
                aria-selected={idx === i}
                onClick={() => go(idx)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
