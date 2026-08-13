"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { drawTicket, canvasToBlob, triggerDownload } from "@/lib/ticket";
import type { Movie } from "@/lib/types";

export default function TicketStub({ movie }: { movie: Movie }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [posterEmbedded, setPosterEmbedded] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setPosterEmbedded(true);
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await drawTicket(canvas, movie, { includePoster: true });
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [open, movie]);

  /** Poster art loaded from TMDB's CDN can taint the canvas if the CDN
   *  doesn't send permissive CORS headers — `drawImage` still succeeds
   *  (it renders fine on screen), but reading pixels back out via toBlob
   *  then throws. Rather than pre-checking, just try the real thing and
   *  fall back to a poster-less redraw on failure, so Download/Share
   *  always end up working one way or another. */
  async function blobOrFallback(): Promise<Blob> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("no canvas");
    try {
      return await canvasToBlob(canvas);
    } catch {
      await drawTicket(canvas, movie, { includePoster: false });
      setPosterEmbedded(false);
      return canvasToBlob(canvas);
    }
  }

  async function download() {
    try {
      const blob = await blobOrFallback();
      triggerDownload(blob, `${movie.id}-cinetonight-ticket.png`);
    } catch {
      /* canvas truly unreadable — it's still visible on screen to screenshot */
    }
  }

  async function share() {
    try {
      const blob = await blobOrFallback();
      const file = new File([blob], `${movie.id}-cinetonight-ticket.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `${movie.title} — CineTonight ticket` });
        return;
      }
      triggerDownload(blob, `${movie.id}-cinetonight-ticket.png`);
    } catch {
      /* user cancelled the share sheet, or nothing could be extracted — no-op */
    }
  }

  return (
    <>
      <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
        <Icon name="cam" size={16} /> <span>Get Ticket Stub</span>
      </button>

      <div className={`rmodal${open ? " open" : ""}`} onClick={() => setOpen(false)}>
        <div className="rmodal__box tstub__box" onClick={(e) => e.stopPropagation()}>
          <div className="rmodal__bar">
            <b>🎟️ Your CineTonight Ticket</b>
            <button className="rmodal__x" onClick={() => setOpen(false)} aria-label="Close"><Icon name="x" size={18} /></button>
          </div>
          <div className="tstub__body">
            <div className="tstub__canvasWrap">
              <canvas ref={canvasRef} className="tstub__canvas" />
              {!ready && <div className="tstub__loading">Printing your ticket…</div>}
            </div>
            {ready && !posterEmbedded && (
              <p className="tstub__note">Poster art couldn't be embedded for download — sharing a text-only ticket instead.</p>
            )}
            <div className="tstub__actions">
              <button type="button" className="rmodal__btn rmodal__btn--primary" onClick={download} disabled={!ready}>
                Download PNG
              </button>
              <button type="button" className="rmodal__btn" onClick={share} disabled={!ready}>
                Share
              </button>
            </div>
            <p className="tstub__hint">Perfect for Instagram Stories or WhatsApp Status.</p>
          </div>
        </div>
      </div>
    </>
  );
}
