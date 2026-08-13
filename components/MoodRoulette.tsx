"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import WatchlistButton from "./WatchlistButton";
import { poster } from "@/lib/images";
import { MOODS, moviesForMood, type Mood } from "@/lib/moods";
import type { Movie } from "@/lib/types";

type Step = "moods" | "spinning" | "result";

const SPIN_MS = 900;
const FLICKER_MS = 90;

export default function MoodRoulette({ movies }: { movies: Movie[] }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("moods");
  const [mood, setMood] = useState<Mood | null>(null);
  const [result, setResult] = useState<Movie | null>(null);
  const [flicker, setFlicker] = useState<Movie | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live TMDB pools, cached per mood for the session — first spin fetches,
  // "Spin Again" is instant.
  const livePoolRef = useRef<Record<string, Movie[]>>({});
  const spinSeq = useRef(0);

  const clearTimers = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  /** Live, popular, well-rated TMDB titles for this mood — falling back to
   *  the local catalogue pool if the API has nothing (TMDB down/unset), so
   *  the wheel always has something to land on. */
  async function poolFor(m: Mood): Promise<Movie[]> {
    const cached = livePoolRef.current[m.id];
    if (cached?.length) return cached;
    try {
      const res = await fetch(`/api/mood?id=${encodeURIComponent(m.id)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.results) && data.results.length) {
          livePoolRef.current[m.id] = data.results;
          return data.results;
        }
      }
    } catch { /* fall through to local */ }
    return moviesForMood(m, movies);
  }

  function spin(m: Mood, avoidId?: string) {
    clearTimers();
    const mySpin = ++spinSeq.current;
    setMood(m);
    setStep("spinning");
    // Flicker over the local pool immediately (feels instant) while the
    // live pool loads; once it arrives, flicker + final pick use it.
    let pool = moviesForMood(m, movies);
    if (pool.length) setFlicker(pool[Math.floor(Math.random() * pool.length)]);

    intervalRef.current = setInterval(() => {
      if (pool.length) setFlicker(pool[Math.floor(Math.random() * pool.length)]);
    }, FLICKER_MS);

    const started = Date.now();
    poolFor(m).then((livePool) => {
      if (mySpin !== spinSeq.current) return; // superseded by a newer spin/close
      if (livePool.length) pool = livePool;
      const finish = () => {
        if (mySpin !== spinSeq.current) return;
        clearTimers();
        if (!pool.length) { setStep("moods"); return; }
        // Weight the pick toward the strongest matches (top of the pool is
        // sorted by votes/popularity server-side) while avoiding an
        // immediate repeat on "Spin Again".
        const top = pool.slice(0, 12).filter((x) => x.id !== avoidId);
        const list = top.length ? top : pool;
        setResult(list[Math.floor(Math.random() * list.length)]);
        setStep("result");
      };
      const elapsed = Date.now() - started;
      timeoutRef.current = setTimeout(finish, Math.max(SPIN_MS - elapsed, 150));
    });
  }

  function close() {
    clearTimers();
    setOpen(false);
    setStep("moods");
    setMood(null);
    setResult(null);
    setFlicker(null);
  }

  const shown = step === "spinning" ? flicker : result;

  return (
    <>
      <button type="button" className="roulette-cta" onClick={() => setOpen(true)}>
        <span className="roulette-cta__ic" aria-hidden="true">🎲</span>
        <span>
          <b>Not sure what to watch?</b>
          <span className="roulette-cta__sub">Spin the Mood Roulette and let us pick.</span>
        </span>
        <span className="roulette-cta__go">Spin <Icon name="arrow" size={14} /></span>
      </button>

      <div className={`rmodal${open ? " open" : ""}`} onClick={close}>
        <div className="rmodal__box" onClick={(e) => e.stopPropagation()}>
          <div className="rmodal__bar">
            <b>🎲 Mood Roulette</b>
            <button className="rmodal__x" onClick={close} aria-label="Close"><Icon name="x" size={18} /></button>
          </div>

          {step === "moods" && (
            <div className="rmodal__body">
              <p className="rmodal__lead">What are you in the mood for?</p>
              <div className="rmodal__moods">
                {MOODS.map((m) => (
                  <button key={m.id} type="button" className="rmodal__mood" onClick={() => spin(m)}>
                    <span className="rmodal__moodEmoji" aria-hidden="true">{m.emoji}</span>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(step === "spinning" || step === "result") && shown && (
            <div className={`rmodal__result${step === "spinning" ? " spinning" : ""}`}>
              <div className="rmodal__rposter">
                <Image
                  fill
                  alt={`${shown.title} poster`}
                  src={poster(shown, "w500")}
                  sizes="180px"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0"; }}
                />
              </div>
              <div className="rmodal__rinfo">
                {step === "spinning" ? (
                  <div className="rmodal__spinning">Spinning{mood ? ` for ${mood.emoji} ${mood.label}…` : "…"}</div>
                ) : (
                  <>
                    <div className="rmodal__rmood">{mood?.emoji} {mood?.label} pick</div>
                    <h3 className="rmodal__rtitle">{shown.title}</h3>
                    <div className="rmodal__rmeta">
                      <span>{shown.year || "—"}</span>
                      {shown.genres[0] && <><span>·</span><span>{shown.genres[0]}</span></>}
                      <span className="r"><Icon name="star" size={12} /> {shown.rating.toFixed(1)}</span>
                    </div>
                    <p className="rmodal__rdesc">{shown.desc}</p>
                    <div className="rmodal__ractions">
                      <Link className="rmodal__btn rmodal__btn--primary" href={`/movie/${shown.id}`} onClick={close}>
                        View Title
                      </Link>
                      <button
                        type="button"
                        className="rmodal__btn"
                        onClick={() => mood && spin(mood, shown.id)}
                      >
                        <Icon name="sparkle" size={14} /> Spin Again
                      </button>
                      <WatchlistButton id={shown.id} />
                    </div>
                    <button type="button" className="rmodal__back" onClick={() => { setStep("moods"); setResult(null); }}>
                      ← Choose a different mood
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
