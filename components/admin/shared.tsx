"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/* ============================================================================
 * components/admin/shared.tsx — pieces used by more than one admin screen.
 *
 * Extracted in Stage 2 so a new screen (the Blog manager) can reuse the media
 * picker and fetch helper without importing the whole 1,400-line
 * AdminDashboard, which would pull every other tab into its bundle too.
 * Behaviour is unchanged — this is a move, not a rewrite.
 * ========================================================================= */

/** Shared fetch helper. Never throws: callers branch on `ok` and show
 *  `data.error`, so a failed save always has something to display. */
export async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Upload a file to the Media Library. Returns the public URL on success, or
 *  { error } on failure — callers must surface the error, not swallow it. */
export async function uploadMedia(file: File): Promise<{ url: string } | { error: string }> {
  const form = new FormData();
  form.append("file", file);
  const { ok, data } = await api<{ media?: { url: string }; error?: string }>("/api/admin/media", { method: "POST", body: form });
  if (ok && data.media?.url) return { url: data.media.url };
  return { error: data.error ?? "Upload failed." };
}

export type LibraryItem = { id: string; url: string; name: string; mime_type: string | null };

/** "Current image + upload new + pick existing" control, reused by Blog,
 *  Catalogue and the homepage screens. */
export function ImagePicker({ url, onChange, label }: { url: string | null | undefined; onChange: (url: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[] | null>(null);
  const [libraryErr, setLibraryErr] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    const result = await uploadMedia(file);
    setBusy(false);
    if ("url" in result) onChange(result.url); else setErr(result.error);
  };

  const toggleLibrary = async () => {
    if (browsing) { setBrowsing(false); return; }
    setBrowsing(true);
    if (library) return; // already fetched once this session
    setLibraryErr(null);
    const { ok, data } = await api<{ media?: LibraryItem[]; error?: string }>("/api/admin/media");
    if (ok) setLibrary((data.media ?? []).filter((m) => !m.mime_type || m.mime_type.startsWith("image/")));
    else setLibraryErr(data.error ?? "Could not load the Media Library.");
  };

  return (
    <div>
      <div className="ad__imgpick">
        {url ? <img alt="" src={url} /> : <div className="ad__thumb" style={{ width: 88, height: 56 }} />}
        <label className="ad__upload" style={{ cursor: "pointer" }}>
          <Icon name="plus" size={14} /> {busy ? "Uploading…" : label}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => pick(e.target.files)} />
        </label>
        <button type="button" className="ad__upload" onClick={toggleLibrary}>
          <Icon name="film" size={14} /> {browsing ? "Close library" : "Choose from library"}
        </button>
        {url && <button type="button" className="ad__mini ad__mini--x" onClick={() => onChange("")}>Remove</button>}
      </div>
      {err && <div className="ad__err" style={{ marginTop: 6 }}>{err}</div>}

      {browsing && (
        <div className="ad__panel" style={{ marginTop: 10, padding: 12 }}>
          {libraryErr && <div className="ad__err">{libraryErr}</div>}
          {!library && !libraryErr && <div className="empty">Loading…</div>}
          {library && !library.length && <div className="ad__empty">Nothing uploaded yet — use “{label}” to add your first image.</div>}
          {library && library.length > 0 && (
            <div className="ad__picker ad__picker--sm">
              {library.map((m) => (
                <button key={m.id} type="button" className={`ad__pick${url === m.url ? " on" : ""}`}
                  onClick={() => { onChange(m.url); setBrowsing(false); }}>
                  <img alt="" src={m.url} />
                  <span title={m.name}>{m.name}</span>
                  {url === m.url && <em><Icon name="check" size={13} /></em>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The shape /api/admin/** returns alongside a successful write. */
export type Revalidated = {
  status: "done" | "skipped" | "partial";
  cdn: "purged" | "not-configured" | "failed" | "skipped";
  detail?: string;
} | null;

/** One sentence about cache freshness, appended to a save confirmation.
 *
 *  THE RULE: the save itself is already confirmed by the time this is called.
 *  Cache clearing is a separate, best-effort step, so this NEVER says the
 *  publish failed — at worst it says the live page will catch up shortly. */
export function cacheNote(rev: Revalidated): string {
  if (!rev || rev.status === "skipped") return "";
  if (rev.cdn === "purged") return " The live page is updated now.";
  // not-configured / failed / skipped: the pages were refreshed, but the CDN
  // copy expires on its own schedule.
  return " Cache refresh is catching up — the live page may take a few minutes.";
}

/** What the SITE currently does with a post — matches lib/data.ts, which shows
 *  status=published OR (status=scheduled AND publish_at <= now). The dashboard
 *  must agree with the site: a post that is already live but labelled
 *  "scheduled" reads like it never went out. */
export function effectiveBlogStatus(p: { status: string; publish_at: string | null; cat: string }): string {
  if (p.status === "draft") return "draft";
  if (p.status === "scheduled") {
    if (p.publish_at && new Date(p.publish_at).getTime() <= Date.now()) {
      return `live · was scheduled ${new Date(p.publish_at).toLocaleString()}`;
    }
    return `scheduled ${p.publish_at ? new Date(p.publish_at).toLocaleString() : "(no date!)"}`;
  }
  return p.cat;
}
