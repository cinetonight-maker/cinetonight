"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/useScrollLock";
import Icon from "./Icon";
import { drawTicket, canvasToBlob, triggerDownload } from "@/lib/ticket";
import type { Movie } from "@/lib/types";
import { trackTicketCreated, trackShare, toMediaType, once } from "@/lib/analytics";
import { parseTmdbId } from "@/lib/tmdb";

export default function TicketStub({ movie }: { movie: Movie }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [posterEmbedded, setPosterEmbedded] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Shared scroll lock — the old version never cleaned up on unmount, so
  // closing the page with the modal open left the body locked.
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    setPosterEmbedded(true);
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await drawTicket(canvas, movie, { includePoster: true });
      if (!cancelled) {
        setReady(true);
        // SUCCESS boundary: the ticket has actually rendered. once() keys on
        // the title so reopening the same modal doesn't re-fire, while a
        // ticket for a different title still counts.
        if (once(`ticket-${movie.id}`)) {
          trackTicketCreated({ surface: "unknown", media_type: toMediaType(movie.kind), tmdb_id: movie.tmdbId ?? parseTmdbId(movie.id)?.id });
        }
      }
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
      // GA4 recommended `share` event, fired only after the file was
      // actually produced and handed to the browser.
      trackShare({ method: "download", content_type: "ticket", item_id: String(movie.tmdbId ?? movie.id) });
    } catch {
      /* canvas truly unreadable — it's still visible on screen to screenshot */
    }
  }

  async function share() {
    try {
      const blob = await blobOrFallback();
      const file = new File([blob], `${movie.id}-cinetonight-ticket.png`, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: `${movie.title} - CineTonight ticket` });
        // Reached only if the user completed the native share sheet
        // (navigator.share rejects on cancel, landing in catch).
        trackShare({ method: "native_share", content_type: "ticket", item_id: String(movie.tmdbId ?? movie.id) });
        return;
      }
      triggerDownload(blob, `${movie.id}-cinetonight-ticket.png`);
      trackShare({ method: "download", content_type: "ticket", item_id: String(movie.tmdbId ?? movie.id) });
    } catch {
      /* user cancelled the share sheet, or nothing could be extracted — no-op */
    }
  }

  return (
    <>
      <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
        <Icon name="cam" size={16} /> <span>Create My Ticket</span>
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
              <p className="tstub__note">Poster art couldn't be embedded for download - sharing a text-only ticket instead.</p>
            )}
            {/* Share is the PRIMARY action - the point of this feature is a
                shareable ticket, not a saved file. Download stays available as
                a fallback (also what Share itself falls back to when the Web
                Share API isn't supported - see share() above). */}
            <div className="tstub__actions">
              <button type="button" className="rmodal__btn rmodal__btn--primary" onClick={share} disabled={!ready}>
                Share This Ticket
              </button>
              <button type="button" className="rmodal__btn" onClick={download} disabled={!ready}>
                Download PNG
              </button>
            </div>
            <p className="tstub__hint">Perfect for Instagram Stories or WhatsApp Status.</p>
          </div>
        </div>
      </div>
    </>
  );
}
