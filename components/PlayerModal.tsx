"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import type { PlayRequest } from "@/lib/player";

/** Placeholder stream (Blender Foundation, CC BY 3.0) — stands in for the feature itself. */
const SAMPLE = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

type State = {
  open: boolean;
  title: string;
  key: string | null;       // YouTube trailer key
  loading: boolean;
  mode: "trailer" | "watch";
};

const CLOSED: State = { open: false, title: "", key: null, loading: false, mode: "watch" };

export default function PlayerModal() {
  const [s, setS] = useState<State>(CLOSED);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let reqId = 0;

    const onPlay = async (e: Event) => {
      const d = ((e as CustomEvent).detail ?? {}) as PlayRequest;
      const mine = ++reqId;
      const mode = d.mode ?? "watch";

      // If we already know the key, start immediately.
      if (d.trailerKey) {
        setS({ open: true, title: d.title ?? "", key: d.trailerKey, loading: false, mode });
        return;
      }
      // Otherwise open right away and look it up.
      setS({ open: true, title: d.title ?? "", key: null, loading: Boolean(d.movieId), mode });
      if (!d.movieId) return;
      try {
        const r = await fetch(`/api/trailer?id=${encodeURIComponent(d.movieId)}`);
        const j = await r.json();
        if (mine === reqId) setS((p) => (p.open ? { ...p, key: j.key ?? null, loading: false } : p));
      } catch {
        if (mine === reqId) setS((p) => ({ ...p, loading: false }));
      }
    };

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setS(CLOSED); };
    window.addEventListener("moviex:play", onPlay);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("moviex:play", onPlay); window.removeEventListener("keydown", onKey); };
  }, []);

  useEffect(() => {
    document.body.style.overflow = s.open ? "hidden" : "";
    const v = videoRef.current;
    if (v && !s.key) { if (s.open) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); }
  }, [s.open, s.key]);

  const close = () => setS(CLOSED);
  const label = s.key ? "Trailer" : s.mode === "trailer" ? "Trailer" : "Now Playing";

  return (
    <div className={`pmodal${s.open ? " open" : ""}`} onClick={close}>
      <div className="pmodal__box" onClick={(e) => e.stopPropagation()}>
        {/* A full-bleed player reads better than a small letterboxed card —
            the title used to live in a persistent top bar, which on a
            laptop screen left the video itself noticeably smaller than the
            window. It's now an aria-label on the close button (still
            announced to screen readers) instead of a bar that eats space
            from the video on every screen size. */}
        <button className="pmodal__x" onClick={close} aria-label={`Close ${label}${s.title ? ` — ${s.title}` : ""}`}>
          <Icon name="x" size={20} />
        </button>

        {s.loading ? (
          <div className="pmodal__wait">Finding trailer…</div>
        ) : s.key ? (
          <iframe
            className="pmodal__yt"
            src={`https://www.youtube-nocookie.com/embed/${s.key}?autoplay=1&rel=0&modestbranding=1`}
            title={`${s.title} trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <video ref={videoRef} controls playsInline poster="https://picsum.photos/seed/player/1200/675">
              <source src={SAMPLE} type="video/mp4" />
            </video>
            {s.mode === "trailer" && s.open && (
              <div className="pmodal__note">No trailer available for this title — showing a sample clip.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
