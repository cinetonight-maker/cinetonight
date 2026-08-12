"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import WatchlistButton from "./WatchlistButton";
import { poster } from "@/lib/images";
import { MOODS, moviesForMood, pickForMood, type Mood } from "@/lib/moods";
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

  function spin(m: Mood, avoidId?: string) {
    clearTimers();
    const pool = moviesForMood(m, movies);
    setMood(m);
    setStep("spinning");
    if (!pool.length) { setStep("moods"); return; }

    intervalRef.current = setInterval(() => {
      setFlicker(pool[Math.floor(Math.random() * pool.length)]);
    }, FLICKER_MS);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const final = pickForMood(m, movies, avoidId);
      setResult(final);
      setStep("result");
    }, SPIN_MS);
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
