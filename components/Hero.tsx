"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import Link from "next/link";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import { posterLg, backdrop } from "@/lib/images";

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
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const n = slides.length;

  const go = useCallback((next: number) => { if (n) setI(((next % n) + n) % n); }, [n]);

  // Touch swipe — phones/tablets have no hover to reveal the prev/next
  // buttons in the first place, so swipe is the primary way to change
  // slides there. Horizontal-only: a mostly-vertical drag is the visitor
  // scrolling the page, not trying to swipe the hero, so it's ignored.
  const SWIPE_THRESHOLD = 40;
  const onTouchStart = (e: ReactTouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setPaused(true);
  };
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    setPaused(false);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? i + 1 : i - 1);
  };

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

  // Art direction, not just a resize: the portrait poster that works fine
  // on a phone-width hero reads as an oddly cropped, over-zoomed mess once
  // the section is wide enough to be a laptop-style full-bleed banner — it
  // needs the movie's own wide backdrop there instead, a genuinely
  // different image. A single <Image> can only pick one `src`, so this
  // builds a real <picture> via next/image's getImageProps() (the
  // documented pattern for this exact case): the browser picks and
  // downloads ONLY the source that matches, never both. 901px matches the
  // breakpoint the rest of this section's own responsive CSS already uses
  // (see the max-width:900px rules below) — anything narrower is where the
  // poster crop still looks right.
  // Plain URLs per breakpoint: with image optimization disabled,
  // getImageProps() no longer emits srcSets, which silently killed the
  // desktop <source> and let the PORTRAIT poster render on laptops. The
  // <picture> art direction stays; the browser simply picks the wide
  // backdrop at >=901px and the poster below it.
  const desktopSrc = backdrop(m, "w1280");
  const mobileSrc = posterLg(m);
  const heroAlt = `${m.title}${m.year ? ` (${m.year})` : ""} poster`;

  return (
    <section
      className="hero hero--slider"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <picture key={`img-${m.id}`} className="hero__pic">
        <source media="(min-width: 901px)" srcSet={desktopSrc} />
        {/* eslint-disable-next-line @next/next/no-img-element -- art-directed hero */}
        <img src={mobileSrc} alt={heroAlt} className="hero__bgimg" fetchPriority="high" />
      </picture>
      <div className="hero__scrim" />

      <Link className="hero__c" key={`link-${m.id}`} href={`/movie/${m.id}`}>
        {/* The homepage otherwise has no <h1> — this rotates with the
            slide, but the first slide (what search engines and first
            paint both see) always renders here since `i` starts at 0. */}
        <h1 className="hero__t">{m.title}</h1>
        <div className="hero__meta">
          {m.rating > 0 && <span className="hero__rate"><Icon name="star" size={12} /> {m.rating.toFixed(1)}</span>}
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
