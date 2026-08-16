"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import type { Movie, SiteConfig, RowConfig } from "@/lib/types";
import { poster } from "@/lib/images";
import { supabaseBrowser } from "@/lib/supabase/client";

type Tab = "sync" | "hero" | "rows" | "blog" | "catalogue" | "classics" | "pages" | "menus" | "media" | "settings" | "comments";
const TABS: [Tab, string, string][] = [
  ["sync", "Sync Center", "sparkle"],
  ["hero", "Hero Slides", "sparkle"],
  ["rows", "Home Rows", "grid"],
  ["blog", "Blog Posts", "article"],
  ["catalogue", "Catalogue", "film"],
  ["classics", "Free Movies", "playc"],
  ["pages", "Pages", "article"],
  ["menus", "Menus & Footer", "grid"],
  ["media", "Media Library", "film"],
  ["settings", "SEO & Settings", "sparkle"],
  ["comments", "Comments", "article"],
];

/** shared fetch helper — used by every tab below */
async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

type HomeConfig = Omit<SiteConfig, "blog">;
const EMPTY_HOME: HomeConfig = { hero: { slides: [], intervalMs: 6000 }, rows: [], continueWatching: [] };
/** A patch function is handed the freshest server state and returns just the
 *  fields it wants to change — see `save` below for why. */
type HomePatch = (base: HomeConfig) => Partial<HomeConfig>;

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("hero");
  const [site, setSite] = useState<HomeConfig | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "err"; msg?: string }>({ kind: "idle" });
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Everything in this dashboard is Supabase-backed now, so every tab works
  // both in `npm run dev` and on the live site — nothing here needs a
  // rebuild/redeploy to take effect.
  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch("/api/admin/site").then((r) => r.json()).catch(() => ({ error: "Could not reach the server." })),
      fetch("/api/admin/catalogue").then((r) => r.json()).catch(() => ({ movies: [] })),
    ]);
    if (s?.error) setLoadErr(s.error);
    else { setLoadErr(null); setSite(s); }
    setMovies(c?.movies ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Hero/Rows/Continue-Watching all live in one Supabase row, and this tab's
  // copy of it (`site`) can go stale simply by sitting open for a while (e.g.
  // across a migration script run in a terminal). If we saved by blindly
  // spreading that stale copy, one small edit — reorder a slide, tweak a row
  // — would silently overwrite every *other* field back to its old value.
  // So instead: every save re-fetches the current server state first, and
  // the caller only supplies a patch function that computes its change
  // against that fresh copy. Whatever this tab hasn't touched always comes
  // from what's actually in the database right now, never from memory.
  const save = async (patch: HomePatch) => {
    setStatus({ kind: "saving" });
    const fresh = await fetch("/api/admin/site").then((r) => r.json()).catch(() => null);
    const base: HomeConfig = fresh && !fresh.error ? fresh : (site ?? EMPTY_HOME);
    const next: HomeConfig = { ...base, ...patch(base) };
    setSite(next);
    const res = await fetch("/api/admin/site", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    });
    const data = await res.json();
    setStatus(res.ok ? { kind: "ok", msg: "Saved" } : { kind: "err", msg: data.error ?? "Save failed" });
    if (res.ok) setTimeout(() => setStatus({ kind: "idle" }), 1800);
  };

  return (
    <div className="ad">
      <div className="ad__head">
        <div>
          <h1>Dashboard</h1>
          <p>Everything here is live — changes save straight to your site, no rebuild or redeploy needed.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className={`ad__status ad__status--${status.kind}`}>
            {status.kind === "saving" && "Saving…"}
            {status.kind === "ok" && <><Icon name="check" size={14} /> {status.msg}</>}
            {status.kind === "err" && <>⚠ {status.msg}</>}
          </div>
          <button className="ad__btn" onClick={logout}>Log out</button>
        </div>
      </div>

      <div className="ad__tabs">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={`ad__tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>

      {loadErr && (tab === "hero" || tab === "rows") && (
        <div className="ad__err">{loadErr}</div>
      )}
      {tab === "sync" && <SyncTab reload={load} />}
      {tab === "hero" && site && <HeroTab site={site} movies={movies} save={save} />}
      {tab === "rows" && site && <RowsTab site={site} movies={movies} save={save} />}
      {tab === "blog" && <BlogTab />}
      {tab === "catalogue" && <CatalogueTab movies={movies} reload={load} />}
      {tab === "classics" && <ClassicsTab />}
      {tab === "pages" && <PagesTab />}
      {tab === "menus" && <MenusTab />}
      {tab === "media" && <MediaTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "comments" && <CommentsTab />}
    </div>
  );
}

/* ---------------------------- sync center -------------------------------- */
type SyncRun = {
  id: number; trigger: string; started_at: string; finished_at: string | null; ok: boolean;
  added: string[]; refreshed: number; hero_slides: string[]; errors: string[];
};
type SyncStatus = { heroMode: "auto" | "manual"; catalogueCount: number; runs: SyncRun[] };

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function SyncTab({ reload }: { reload: () => void }) {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const d = await fetch("/api/admin/sync").then((r) => r.json()).catch(() => null);
    if (d && !d.error) setSt(d);
    else setMsg(d?.error ?? "Could not load sync status.");
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const runSync = async () => {
    setBusy(true);
    setMsg("Syncing with TMDB. This can take up to a minute, leave this tab open.");
    const res = await fetch("/api/admin/sync", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "run" }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? (Array.isArray(d.errors) && d.errors.length ? d.errors.join("; ") : "Sync failed.")); return; }
    if (d.skipped) setMsg(`Skipped: ${d.skipped}`);
    else setMsg(
      `Done. ${d.added?.length ?? 0} new title${(d.added?.length ?? 0) === 1 ? "" : "s"} added, ` +
      `${d.refreshed ?? 0} refreshed${d.heroSlides?.length ? ", hero rotated to trending" : ""}. ` +
      `Visitors see the update within about 5 minutes (page cache).`
    );
    loadStatus(); reload();
  };

  const setHeroMode = async (mode: "auto" | "manual") => {
    setBusy(true);
    const res = await fetch("/api/admin/sync", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "heroMode", mode }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error ?? "Could not change hero mode. Have you run supabase/sync_upgrade.sql?"); return; }
    setMsg(mode === "auto"
      ? "Hero set to Auto: each sync rotates the hero to the top trending titles."
      : "Hero set to Manual: your picks in the Hero Slides tab stay exactly as you set them.");
    loadStatus();
  };

  const lastRun = st?.runs?.[0];

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Catalogue sync</h2>
          <button className="ad__btn ad__btn--primary" disabled={busy} onClick={runSync}>
            <Icon name="sparkle" size={14} /> {busy ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <p className="ad__hint">
          One click pulls TMDB&apos;s current global trending list, adds anything your catalogue is missing (up to 8 per
          run), re-pulls the 15 stalest titles so ratings and artwork stay current, and rotates the hero if it is in Auto
          mode. The daily auto sync runs this exact same engine on a schedule. Nothing is ever deleted by a sync.
        </p>
        {msg && <div className="ad__note">{msg}</div>}
        <div className="ad__note" style={{ marginTop: 10 }}>
          {st ? <>Catalogue: <b>{st.catalogueCount}</b> titles.&nbsp;
            {lastRun
              ? <>Last sync: <b>{timeAgo(lastRun.started_at)}</b> ({lastRun.trigger === "cron" ? "scheduled" : "manual"}, {lastRun.ok ? "ok" : "had errors"}).</>
              : <>No sync history yet. Run supabase/sync_upgrade.sql once to enable history, then press Sync now.</>}
          </> : "Loading status…"}
        </div>
      </section>

      <section className="ad__panel">
        <h2>Hero mode</h2>
        <p className="ad__hint">
          <b>Auto</b>: every sync re-points the homepage hero at the top trending titles (fresh without lifting a finger).
          <b> Manual</b>: the hero shows exactly what you picked in the Hero Slides tab, and syncs never touch it.
        </p>
        <div className="ad__actions">
          <button className={`ad__btn${st?.heroMode === "auto" ? " ad__btn--primary" : ""}`} disabled={busy} onClick={() => setHeroMode("auto")}>
            {st?.heroMode === "auto" ? "✓ " : ""}Auto (trending)
          </button>
          <button className={`ad__btn${st?.heroMode === "manual" ? " ad__btn--primary" : ""}`} disabled={busy} onClick={() => setHeroMode("manual")}>
            {st?.heroMode === "manual" ? "✓ " : ""}Manual (my picks)
          </button>
        </div>
      </section>

      <section className="ad__panel">
        <h2>Sync history <span className="ad__count">{st?.runs?.length ?? 0}</span></h2>
        {(!st || st.runs.length === 0) && <div className="ad__empty">No runs recorded yet.</div>}
        <div className="ad__list">
          {(st?.runs ?? []).map((r) => (
            <div className="ad__row" key={r.id}>
              <span className="ad__name">
                {r.ok ? "✓" : "⚠"} {timeAgo(r.started_at)} · {r.trigger === "cron" ? "scheduled" : "manual"}
              </span>
              <span className="ad__meta">
                +{(r.added ?? []).length} added · {r.refreshed} refreshed
                {(r.hero_slides ?? []).length ? " · hero rotated" : ""}
                {(r.errors ?? []).length ? ` · ${(r.errors ?? []).length} error(s)` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- hero ---------------------------------- */
function HeroTab({ site, movies, save }: { site: HomeConfig; movies: Movie[]; save: (patch: HomePatch) => void }) {
  const slides = site.hero?.slides ?? [];
  const toggle = (id: string) => {
    save((base) => {
      const cur = base.hero?.slides ?? [];
      const next = cur.includes(id) ? cur.filter((s) => s !== id) : [...cur, id];
      return { hero: { ...base.hero, slides: next } };
    });
  };
  const move = (id: string, dir: -1 | 1) => {
    save((base) => {
      const cur = base.hero?.slides ?? [];
      const i = cur.indexOf(id); const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return {};
      const next = cur.slice(); [next[i], next[j]] = [next[j], next[i]];
      return { hero: { ...base.hero, slides: next } };
    });
  };

  return (
    <div className="ad__body">
      <section className="ad__panel">
        <h2>Slides <span className="ad__count">{slides.length}</span></h2>
        <p className="ad__hint">
          Shown in order. These rotate on the home page. Heads up: if Hero mode in the Sync Center is set to
          <b> Auto</b>, the daily sync replaces these with the current trending titles. Switch it to <b>Manual</b> there
          to keep your picks.
        </p>
        {slides.length === 0 && <div className="ad__empty">No slides yet — pick titles below.</div>}
        <div className="ad__list">
          {slides.map((id, i) => {
            const m = movies.find((x) => x.id === id);
            return (
              <div className="ad__row" key={id}>
                <span className="ad__idx">{i + 1}</span>
                {m && <img className="ad__thumb" alt="" src={poster(m)} />}
                <span className="ad__name">{m?.title ?? id}</span>
                <button className="ad__mini" onClick={() => move(id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button className="ad__mini" onClick={() => move(id, 1)} disabled={i === slides.length - 1} aria-label="Move down">↓</button>
                <button className="ad__mini ad__mini--x" onClick={() => toggle(id)} aria-label="Remove">✕</button>
              </div>
            );
          })}
        </div>
        <label className="ad__field" style={{ marginTop: 18 }}>
          <span>Rotation speed (seconds)</span>
          <input type="number" min={2} max={30}
            value={Math.round((site.hero?.intervalMs ?? 6000) / 1000)}
            onChange={(e) => {
              const ms = Math.max(2, Number(e.target.value)) * 1000;
              save((base) => ({ hero: { ...base.hero, intervalMs: ms } }));
            }} />
        </label>
      </section>

      <section className="ad__panel">
        <h2>Add from catalogue</h2>
        <div className="ad__picker">
          {movies.map((m) => (
            <button key={m.id} className={`ad__pick${slides.includes(m.id) ? " on" : ""}`} onClick={() => toggle(m.id)}>
              <img alt="" src={poster(m)} />
              <span>{m.title}</span>
              {slides.includes(m.id) && <em><Icon name="check" size={13} /></em>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------- rows ---------------------------------- */
function RowsTab({ site, movies, save }: { site: HomeConfig; movies: Movie[]; save: (patch: HomePatch) => void }) {
  const rows = site.rows ?? [];
  // Rows/continue-watching entries are addressed by id here (not array index),
  // so a patch still lands on the right item even if the freshly-fetched
  // server order/length differs slightly from what this tab last rendered.
  const update = (id: string, patch: Partial<RowConfig>) => {
    save((base) => {
      const cur = base.rows ?? [];
      const idx = cur.findIndex((r) => r.id === id);
      if (idx < 0) return {};
      const next = cur.slice(); next[idx] = { ...next[idx], ...patch };
      return { rows: next };
    });
  };
  const moveRow = (id: string, dir: -1 | 1) => {
    save((base) => {
      const cur = base.rows ?? [];
      const i = cur.findIndex((r) => r.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return {};
      const next = cur.slice(); [next[i], next[j]] = [next[j], next[i]];
      return { rows: next };
    });
  };
  const addRow = () => save((base) => ({
    rows: [...(base.rows ?? []), { id: `row-${Date.now()}`, title: "New Row", mode: "auto", rule: { kind: "all", sort: "year", limit: 6 }, style: "plain" }],
  }));
  const removeRow = (id: string) => save((base) => ({ rows: (base.rows ?? []).filter((r) => r.id !== id) }));


  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Home rows <span className="ad__count">{rows.length}</span></h2>
          <button className="ad__btn" onClick={addRow}><Icon name="plus" size={14} /> Add row</button>
        </div>
        <p className="ad__hint">
          <b>Live</b> pulls straight from TMDB in real time — no sync needed, always current (falls back to Auto if TMDB
          is unreachable). <b>Auto</b> keeps a row up to date by rule from your saved catalogue. <b>Manual</b> lets you
          hand-pick and order titles.
        </p>

        {rows.map((row, i) => (
          <div className="ad__card" key={row.id}>
            <div className="ad__cardhead">
              <input className="ad__title" value={row.title} onChange={(e) => update(row.id, { title: e.target.value })} />
              <button className="ad__mini" onClick={() => moveRow(row.id, -1)} disabled={i === 0}>↑</button>
              <button className="ad__mini" onClick={() => moveRow(row.id, 1)} disabled={i === rows.length - 1}>↓</button>
              <button className="ad__mini ad__mini--x" onClick={() => removeRow(row.id)}>✕</button>
            </div>

            <div className="ad__controls">
              <label className="ad__field">
                <span>Mode</span>
                <select value={row.mode} onChange={(e) => update(row.id, { mode: e.target.value as RowConfig["mode"] })}>
                  <option value="auto">Auto (by rule)</option>
                  <option value="live">Live (from TMDB)</option>
                  <option value="manual">Manual (hand-picked)</option>
                </select>
              </label>

              {row.mode === "live" && (
                <label className="ad__field">
                  <span>Source</span>
                  <select value={row.live ?? "trending"} onChange={(e) => update(row.id, { live: e.target.value as RowConfig["live"] })}>
                    <option value="trending">Trending now</option>
                    <option value="latest">Latest releases</option>
                    <option value="toprated">Top rated</option>
                    <option value="hollywood">Hollywood</option>
                    <option value="bollywood">Bollywood</option>
                    <option value="korean">K-Drama</option>
                    <option value="anime">Anime</option>
                    <option value="chinese">C-Drama</option>
                    <option value="telugu">Telugu (Tollywood)</option>
                  </select>
                </label>
              )}

              {row.mode === "auto" || row.mode === "live" ? (
                <>
                  <label className="ad__field">
                    <span>Type</span>
                    <select value={row.rule?.kind ?? "all"} onChange={(e) => update(row.id, { rule: { ...row.rule, kind: e.target.value as "all" | "movie" | "series" } })}>
                      <option value="all">All</option><option value="movie">Movies</option><option value="series">Web Series</option>
                    </select>
                  </label>
                  {row.mode === "auto" && (
                    <label className="ad__field">
                      <span>Sort by</span>
                      <select value={row.rule?.sort ?? "year"} onChange={(e) => update(row.id, { rule: { ...row.rule, sort: e.target.value as "year" | "rating" | "votes" | "az" } })}>
                        <option value="year">Newest first</option><option value="rating">Highest rated</option>
                        <option value="votes">Most popular</option><option value="az">A–Z</option>
                      </select>
                    </label>
                  )}
                  <label className="ad__field">
                    <span>Show</span>
                    <input type="number" min={1} max={20} value={row.rule?.limit ?? 6}
                      onChange={(e) => update(row.id, { rule: { ...row.rule, limit: Number(e.target.value) } })} />
                  </label>
                </>
              ) : null}

              <label className="ad__field">
                <span>Style</span>
                <select value={row.style ?? "plain"} onChange={(e) => update(row.id, { style: e.target.value as RowConfig["style"] })}>
                  <option value="plain">Plain</option><option value="ranked">Numbered</option><option value="badge">NEW badge</option>
                </select>
              </label>
            </div>

            {row.mode === "manual" && (
              <div className="ad__picker ad__picker--sm">
                {movies.map((m) => {
                  const on = (row.items ?? []).includes(m.id);
                  return (
                    <button key={m.id} className={`ad__pick${on ? " on" : ""}`}
                      onClick={() => update(row.id, { items: on ? (row.items ?? []).filter((x) => x !== m.id) : [...(row.items ?? []), m.id] })}>
                      <img alt="" src={poster(m)} />
                      <span>{m.title}</span>
                      {on && <em><Icon name="check" size={13} /></em>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>

    </div>
  );
}

/* --------------------------- shared: media picker ------------------------ */
/** Upload a file to the Media Library. Returns the public URL on success, or
 *  { error } on failure — callers must surface the error, not swallow it. */
async function uploadMedia(file: File): Promise<{ url: string } | { error: string }> {
  const form = new FormData();
  form.append("file", file);
  const { ok, data } = await api<{ media?: { url: string }; error?: string }>("/api/admin/media", { method: "POST", body: form });
  if (ok && data.media?.url) return { url: data.media.url };
  return { error: data.error ?? "Upload failed." };
}

type LibraryItem = { id: string; url: string; name: string; mime_type: string | null };

/** Small "current image + upload new + pick existing" control, reused by
 *  Blog and Catalogue tabs. Uploading a fresh file was the only option
 *  before — this also lets you reuse anything already in the Media
 *  Library instead of uploading the same image twice. */
function ImagePicker({ url, onChange, label }: { url: string | null | undefined; onChange: (url: string) => void; label: string }) {
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
    if (library) return; // already fetched once this session — no need to refetch every open
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

/* ------------------------------- blog ---------------------------------- */
type BlogRow = {
  id: string; slug: string; title: string; cat: string; excerpt: string; body: string[];
  image_url: string | null; date_label: string; read_label: string;
  status: "draft" | "published" | "scheduled";
  meta_title: string; meta_description: string; publish_at: string | null;
};
type CategoryRow = { id: string; name: string };
const EMPTY_POST: Omit<BlogRow, "id"> = {
  slug: "", title: "", cat: "Guides", excerpt: "", body: [], image_url: null,
  date_label: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  read_label: "5 min", status: "draft",
  meta_title: "", meta_description: "", publish_at: null,
};
/** ISO timestamp -> value for <input type="datetime-local"> (local time). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function BlogTab() {
  const [posts, setPosts] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // post id, or "new"
  const [draft, setDraft] = useState(EMPTY_POST);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [newCat, setNewCat] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [postsRes, catsRes] = await Promise.all([
      api<{ posts?: BlogRow[]; error?: string }>("/api/admin/blog"),
      api<{ categories?: CategoryRow[] }>("/api/admin/categories"),
    ]);
    if (postsRes.ok) { setPosts(postsRes.data.posts ?? []); setErr(null); }
    else setErr(postsRes.data.error ?? "Could not load posts.");
    if (catsRes.ok) setCats(catsRes.data.categories ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return;
    const res = await api("/api/admin/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) { setNewCat(""); load(); }
  };
  const removeCat = async (c: CategoryRow) => {
    if (!confirm(`Delete category "${c.name}"? Existing posts keep their label.`)) return;
    await api(`/api/admin/categories?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
    load();
  };

  const startNew = () => { setDraft(EMPTY_POST); setEditing("new"); };
  const startEdit = (p: BlogRow) => {
    setDraft({
      slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt, body: p.body ?? [],
      image_url: p.image_url, date_label: p.date_label, read_label: p.read_label, status: p.status,
      meta_title: p.meta_title ?? "", meta_description: p.meta_description ?? "", publish_at: p.publish_at ?? null,
    });
    setEditing(p.id);
  };

  const commit = async () => {
    if (!draft.title.trim()) return;
    // Category must be one of the managed list (add it in Categories first).
    if (cats.length && !cats.some((c) => c.name === draft.cat)) {
      setErr(`"${draft.cat}" is not a category yet. Add it in the Categories panel below, then save.`);
      return;
    }
    if (draft.status === "scheduled" && !draft.publish_at) {
      setErr("Pick a publish date and time for a scheduled post.");
      return;
    }
    setBusy(true);
    const payload = {
      title: draft.title, slug: draft.slug, cat: draft.cat, excerpt: draft.excerpt, body: draft.body,
      imageUrl: draft.image_url, date: draft.date_label, read: draft.read_label, status: draft.status,
      metaTitle: draft.meta_title, metaDescription: draft.meta_description, publishAt: draft.publish_at,
    };
    const res = editing === "new"
      ? await api("/api/admin/blog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      : await api("/api/admin/blog", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, ...payload }) });
    setBusy(false);
    if (res.ok) { setEditing(null); load(); } else setErr(res.data.error ?? "Could not save post.");
  };

  const remove = async (p: BlogRow) => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await api(`/api/admin/blog?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    load();
  };

  if (err && !posts.length && !loading) return <div className="ad__err">{err} — is the Supabase schema set up? See <code>supabase/schema.sql</code>.</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Blog posts <span className="ad__count">{posts.length}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> New post</button>
        </div>

        {editing !== null && (
          <div className="ad__card ad__card--edit">
            <label className="ad__field"><span>Featured image</span></label>
            <ImagePicker url={draft.image_url} label="Upload image" onChange={(url) => setDraft({ ...draft, image_url: url || null })} />
            <div className="ad__grid2" style={{ marginTop: 14 }}>
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Post title" /></label>
              <label className="ad__field"><span>Category (pick from your list, type to search)</span>
                <input list="ct-blog-cats" value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })} placeholder="Guides" />
                <datalist id="ct-blog-cats">
                  {cats.map((c) => <option key={c.id} value={c.name} />)}
                </datalist></label>
              <label className="ad__field"><span>Date</span>
                <input value={draft.date_label} onChange={(e) => setDraft({ ...draft, date_label: e.target.value })} placeholder="Aug 1, 2024" /></label>
              <label className="ad__field"><span>Read time</span>
                <input value={draft.read_label} onChange={(e) => setDraft({ ...draft, read_label: e.target.value })} placeholder="8 min" /></label>
            </div>
            <label className="ad__field"><span>Excerpt</span>
              <textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} /></label>
            <label className="ad__field"><span>Body — one paragraph per blank-line-separated block</span>
              <textarea rows={9} value={(draft.body ?? []).join("\n\n")}
                onChange={(e) => setDraft({ ...draft, body: e.target.value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean) })} /></label>
            <div className="ad__grid2">
              <label className="ad__field">
                <span>Meta title (search result headline, {`${draft.meta_title.length}`} of 60)</span>
                <input maxLength={70} value={draft.meta_title} placeholder="Defaults to the post title"
                  onChange={(e) => setDraft({ ...draft, meta_title: e.target.value })} />
              </label>
              <label className="ad__field">
                <span>Meta description ({`${draft.meta_description.length}`} of 160)</span>
                <input maxLength={170} value={draft.meta_description} placeholder="Defaults to the excerpt"
                  onChange={(e) => setDraft({ ...draft, meta_description: e.target.value })} />
              </label>
            </div>
            <div className="ad__grid2">
              <label className="ad__field">
                <span>Status</span>
                <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as BlogRow["status"] })}>
                  <option value="draft">Draft (hidden)</option>
                  <option value="published">Published (live now)</option>
                  <option value="scheduled">Scheduled (goes live automatically)</option>
                </select>
              </label>
              {draft.status === "scheduled" && (
                <label className="ad__field">
                  <span>Publish at (your local time)</span>
                  <input type="datetime-local" value={toLocalInput(draft.publish_at)}
                    onChange={(e) => setDraft({ ...draft, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </label>
              )}
            </div>
            <div className="ad__actions">
              <button className="ad__btn ad__btn--primary" disabled={busy} onClick={commit}><Icon name="check" size={14} /> Save post</button>
              <button className="ad__btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {posts.map((p) => (
              <div className="ad__row" key={p.id}>
                {p.image_url && <img className="ad__thumb" alt="" src={p.image_url} style={{ width: 46, height: 32 }} />}
                <span className="ad__cat">{p.status === "draft" ? "draft" : p.status === "scheduled" ? `scheduled ${p.publish_at ? new Date(p.publish_at).toLocaleString() : ""}` : p.cat}</span>
                <span className="ad__name">{p.title}</span>
                <span className="ad__meta">{p.date_label} · {p.read_label}</span>
                <button className="ad__mini" onClick={() => startEdit(p)}>Edit</button>
                <button className="ad__mini ad__mini--x" onClick={() => remove(p)}>✕</button>
              </div>
            ))}
            {!posts.length && <div className="ad__empty">No posts yet.</div>}
          </div>
        )}
      </section>

      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Categories <span className="ad__count">{cats.length}</span></h2>
        </div>
        <div className="ad__list">
          {cats.map((c) => (
            <div className="ad__row" key={c.id}>
              <span className="ad__name">{c.name}</span>
              <span className="ad__meta">{posts.filter((p) => p.cat === c.name).length} posts</span>
              <button className="ad__mini ad__mini--x" onClick={() => removeCat(c)}>✕</button>
            </div>
          ))}
          {!cats.length && <div className="ad__empty">No categories yet. Run supabase/blog_upgrade.sql once, then add some here.</div>}
        </div>
        <div className="ad__actions" style={{ marginTop: 10 }}>
          <input value={newCat} placeholder="New category name" style={{ flex: 1 }}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCat(); }} />
          <button className="ad__btn" onClick={addCat}><Icon name="plus" size={14} /> Add</button>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- catalogue -------------------------------- */
type MovieDraft = {
  title: string; year: number; rating: number; kind: "movie" | "series"; genres: string;
  runtime: string; cert: string; language: string; director: string; writers: string; desc: string;
  posterUrl: string; backdropUrl: string;
};
const draftFromMovie = (m: Movie): MovieDraft => ({
  title: m.title, year: m.year, rating: m.rating, kind: m.kind, genres: m.genres.join(", "),
  runtime: m.runtime, cert: m.cert, language: m.language, director: m.director, writers: m.writers,
  desc: m.desc, posterUrl: m.posterPath ?? "", backdropUrl: m.backdropPath ?? "",
});

function CatalogueTab({ movies, reload }: { movies: Movie[]; reload: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Movie[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MovieDraft | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true); setMsg(null);
    const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setHits((d.results ?? []).filter((m: Movie) => String(m.id).startsWith("tmdb-")));
    setBusy(false);
  };

  const add = async (m: Movie) => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/catalogue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: m.id, kind: m.kind }),
    });
    const d = await res.json();
    setMsg(res.ok ? `Added “${d.movie.title}”.` : d.error);
    setBusy(false);
    if (res.ok) reload();
  };

  const addManual = async () => {
    const title = prompt("Title for the new entry:");
    if (!title || !title.trim()) return;
    const kind = confirm("OK = Movie, Cancel = Web Series") ? "movie" : "series";
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/catalogue", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ manual: true, title: title.trim(), kind }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) { setMsg(`Added “${d.movie.title}”. Fill in the rest below.`); reload(); startEdit(d.movie); }
    else setMsg(d.error);
  };

  const remove = async (m: Movie) => {
    if (!confirm(`Remove “${m.title}” from the catalogue?`)) return;
    setBusy(true);
    await fetch(`/api/admin/catalogue?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    setBusy(false); reload();
  };

  const startEdit = (m: Movie) => { setDraft(draftFromMovie(m)); setEditing(m.id); };

  const commitEdit = async () => {
    if (!draft || !editing) return;
    setBusy(true);
    const res = await fetch("/api/admin/catalogue", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: editing, title: draft.title, year: draft.year, rating: draft.rating, kind: draft.kind,
        genres: draft.genres.split(",").map((g) => g.trim()).filter(Boolean),
        runtime: draft.runtime, cert: draft.cert, language: draft.language, director: draft.director,
        writers: draft.writers, desc: draft.desc, posterUrl: draft.posterUrl, backdropUrl: draft.backdropUrl,
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) { setEditing(null); setDraft(null); reload(); } else setMsg(d.error ?? "Could not save.");
  };

  const refreshOne = async (id: string) => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/catalogue/refresh", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    });
    const d = await res.json();
    setMsg(res.ok ? "Refreshed from TMDB." : d.error);
    setBusy(false);
    if (res.ok) reload();
  };

  const refreshAll = async () => {
    const withTmdb = movies.filter((m) => m.tmdbId);
    if (!withTmdb.length || !confirm(`Refresh all ${withTmdb.length} TMDB-sourced titles? This can take a minute.`)) return;
    setRefreshingAll(true);
    let done = 0;
    for (const m of withTmdb) {
      setRefreshProgress(`${done + 1}/${withTmdb.length} — ${m.title}`);
      await fetch("/api/admin/catalogue/refresh", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: m.id }),
      }).catch(() => null);
      done++;
    }
    setRefreshProgress(null);
    setRefreshingAll(false);
    reload();
  };

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Add a title</h2>
          <button className="ad__btn" disabled={busy} onClick={addManual}><Icon name="plus" size={14} /> Add manually</button>
        </div>
        <p className="ad__hint">Search TMDB and add it to your catalogue — full details and artwork come with it. Not on TMDB? Use “Add manually” and fill in every field yourself.</p>
        <form className="ad__search" onSubmit={search}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search TMDB for a film or show…" />
          <button className="ad__btn ad__btn--primary" disabled={busy}><Icon name="search" size={14} /> Search</button>
        </form>
        {msg && <div className="ad__note">{msg}</div>}
        {hits.length > 0 && (
          <div className="ad__picker">
            {hits.map((m) => (
              <button key={m.id} className="ad__pick" onClick={() => add(m)} disabled={busy}>
                <img alt="" src={poster(m)} />
                <span>{m.title}{m.year ? ` (${m.year})` : ""}</span>
                <em><Icon name="plus" size={13} /></em>
              </button>
            ))}
          </div>
        )}
      </section>

      {editing && draft && (
        <section className="ad__panel">
          <div className="ad__panelhead"><h2>Editing: {draft.title}</h2></div>
          <label className="ad__field"><span>Poster</span></label>
          <ImagePicker url={draft.posterUrl} label="Upload poster" onChange={(url) => setDraft({ ...draft, posterUrl: url })} />
          <label className="ad__field" style={{ marginTop: 12 }}><span>Backdrop</span></label>
          <ImagePicker url={draft.backdropUrl} label="Upload backdrop" onChange={(url) => setDraft({ ...draft, backdropUrl: url })} />

          <div className="ad__grid2" style={{ marginTop: 14 }}>
            <label className="ad__field"><span>Title</span>
              <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
            <label className="ad__field"><span>Year</span>
              <input type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })} /></label>
            <label className="ad__field"><span>Rating (0–10)</span>
              <input type="number" step="0.1" min={0} max={10} value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: Number(e.target.value) })} /></label>
            <label className="ad__field"><span>Type</span>
              <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as "movie" | "series" })}>
                <option value="movie">Movie</option><option value="series">Web Series</option>
              </select></label>
            <label className="ad__field"><span>Genres (comma-separated)</span>
              <input value={draft.genres} onChange={(e) => setDraft({ ...draft, genres: e.target.value })} /></label>
            <label className="ad__field"><span>Runtime</span>
              <input value={draft.runtime} onChange={(e) => setDraft({ ...draft, runtime: e.target.value })} placeholder="2h 10m" /></label>
            <label className="ad__field"><span>Certificate</span>
              <input value={draft.cert} onChange={(e) => setDraft({ ...draft, cert: e.target.value })} placeholder="UA" /></label>
            <label className="ad__field"><span>Language</span>
              <input value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })} /></label>
            <label className="ad__field"><span>Director</span>
              <input value={draft.director} onChange={(e) => setDraft({ ...draft, director: e.target.value })} /></label>
            <label className="ad__field"><span>Writers</span>
              <input value={draft.writers} onChange={(e) => setDraft({ ...draft, writers: e.target.value })} /></label>
          </div>
          <label className="ad__field"><span>Description</span>
            <textarea rows={4} value={draft.desc} onChange={(e) => setDraft({ ...draft, desc: e.target.value })} /></label>
          <div className="ad__actions">
            <button className="ad__btn ad__btn--primary" disabled={busy} onClick={commitEdit}><Icon name="check" size={14} /> Save changes</button>
            <button className="ad__btn" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</button>
          </div>
        </section>
      )}

      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>In your catalogue <span className="ad__count">{movies.length}</span></h2>
          <button className="ad__btn" disabled={refreshingAll} onClick={refreshAll}>
            <Icon name="sparkle" size={14} /> {refreshingAll ? (refreshProgress ?? "Refreshing…") : "Refresh all from TMDB"}
          </button>
        </div>
        <p className="ad__hint">Editing changes are yours to keep — “Refresh from TMDB” re-pulls title/year/rating/cast/etc. from TMDB but never touches a custom poster or backdrop you've uploaded.</p>
        <div className="ad__list">
          {movies.map((m) => (
            <div className="ad__row" key={m.id}>
              <img className="ad__thumb" alt="" src={poster(m)} />
              <span className="ad__name">{m.title}</span>
              <span className="ad__meta">{m.year} · {m.kind === "series" ? "Series" : "Film"} · ★ {m.rating.toFixed(1)}</span>
              {m.tmdbId ? <button className="ad__mini" disabled={busy} onClick={() => refreshOne(m.id)} title="Refresh from TMDB">↻</button> : null}
              <button className="ad__mini" onClick={() => startEdit(m)}>Edit</button>
              <button className="ad__mini ad__mini--x" onClick={() => remove(m)}>✕</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ---------------------------- free classics ------------------------------ */
type ClassicRow = {
  id: string; slug: string; title: string; year: number;
  source_type: "archive" | "youtube"; source_id: string;
  tmdb_id: number | null; description: string; runtime: string | null;
  genre: string | null; status: "draft" | "published"; note: string | null; sort_order: number;
};
const EMPTY_CLASSIC = {
  slug: "", title: "", year: new Date().getFullYear(), source_type: "archive" as "archive" | "youtube",
  source_id: "", tmdb_id: "" as string | number, description: "", runtime: "", genre: "", status: "draft" as "draft" | "published", note: "",
};

function ClassicsTab() {
  const [films, setFilms] = useState<ClassicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // row id, or "new"
  const [draft, setDraft] = useState(EMPTY_CLASSIC);
  const [busy, setBusy] = useState(false);
  // Per-row + in-editor source verification results, keyed by "<type>:<id>".
  const [verify, setVerify] = useState<Record<string, { ok: boolean; why: string } | "checking">>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ classics?: ClassicRow[]; error?: string }>("/api/admin/classics");
    if (ok) { setFilms(data.classics ?? []); setErr(null); } else setErr(data.error ?? "Could not load films.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const checkSource = async (type: "archive" | "youtube", id: string) => {
    const key = `${type}:${id}`;
    setVerify((v) => ({ ...v, [key]: "checking" }));
    const { data } = await api<{ ok: boolean; why: string }>(
      `/api/admin/classics/verify?type=${type}&id=${encodeURIComponent(id)}`
    );
    setVerify((v) => ({ ...v, [key]: { ok: !!data.ok, why: data.why ?? "No response" } }));
  };

  const startNew = () => { setDraft(EMPTY_CLASSIC); setEditing("new"); };
  const startEdit = (f: ClassicRow) => {
    setDraft({
      slug: f.slug, title: f.title, year: f.year, source_type: f.source_type, source_id: f.source_id,
      tmdb_id: f.tmdb_id ?? "", description: f.description, runtime: f.runtime ?? "", genre: f.genre ?? "",
      status: f.status, note: f.note ?? "",
    });
    setEditing(f.id);
  };

  const commit = async () => {
    if (!draft.title.trim() || !draft.source_id.trim()) return;
    setBusy(true);
    const body = JSON.stringify({ ...(editing === "new" ? {} : { id: editing }), ...draft, tmdb_id: draft.tmdb_id === "" ? null : Number(draft.tmdb_id) });
    const res = editing === "new"
      ? await api("/api/admin/classics", { method: "POST", headers: { "content-type": "application/json" }, body })
      : await api("/api/admin/classics", { method: "PUT", headers: { "content-type": "application/json" }, body });
    setBusy(false);
    if (res.ok) { setEditing(null); load(); } else setErr(res.data.error ?? "Could not save film.");
  };

  const remove = async (f: ClassicRow) => {
    if (!confirm(`Delete “${f.title}”?`)) return;
    await api(`/api/admin/classics?id=${encodeURIComponent(f.id)}`, { method: "DELETE" });
    load();
  };

  const togglePublish = async (f: ClassicRow) => {
    await api("/api/admin/classics", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: f.id, status: f.status === "published" ? "draft" : "published" }),
    });
    load();
  };

  const draftVerify = verify[`${draft.source_type}:${draft.source_id.trim()}`];

  if (err && !films.length && !loading) {
    return <div className="ad__err">{err} — is the classics table set up? Run <code>supabase/classics.sql</code> in Supabase&apos;s SQL Editor, then <code>node scripts/sync-classics.mjs</code>.</div>;
  }

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Free Classics <span className="ad__count">{films.length}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> Add film</button>
        </div>
        <p className="ad__hint">
          Full films visitors can legally watch at <code>/free-movies</code>. Only add public-domain films
          (archive.org) or official rights-holder uploads (YouTube) — never a fan upload of a copyrighted
          movie. Always hit <strong>Verify</strong> before publishing: it confirms the source exists and
          actually contains video.
        </p>

        {editing !== null && (
          <div className="ad__card ad__card--edit">
            <div className="ad__grid2">
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Night of the Living Dead" /></label>
              <label className="ad__field"><span>Year</span>
                <input type="number" value={draft.year} onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) || 0 })} /></label>
            </div>
            <div className="ad__grid2">
              <label className="ad__field"><span>Source</span>
                <select value={draft.source_type} onChange={(e) => setDraft({ ...draft, source_type: e.target.value as "archive" | "youtube" })}>
                  <option value="archive">Internet Archive (public domain)</option>
                  <option value="youtube">YouTube (official upload)</option>
                </select></label>
              <label className="ad__field">
                <span>{draft.source_type === "archive" ? "Archive identifier — from archive.org/details/<this-part>" : "YouTube video ID — from watch?v=<this-part>"}</span>
                <input value={draft.source_id} onChange={(e) => setDraft({ ...draft, source_id: e.target.value })} placeholder={draft.source_type === "archive" ? "night-of-the-living-dead_1968" : "dQw4w9WgXcQ"} /></label>
            </div>
            <div className="ad__grid2">
              <label className="ad__field"><span>TMDB id (optional — pulls real poster/rating/cast)</span>
                <input value={String(draft.tmdb_id)} onChange={(e) => setDraft({ ...draft, tmdb_id: e.target.value })} placeholder="10331" /></label>
              <label className="ad__field"><span>Genre · Runtime (optional)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={draft.genre} onChange={(e) => setDraft({ ...draft, genre: e.target.value })} placeholder="Horror" />
                  <input value={draft.runtime} onChange={(e) => setDraft({ ...draft, runtime: e.target.value })} placeholder="1h 36m" />
                </div></label>
            </div>
            <label className="ad__field"><span>Description</span>
              <textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label className="ad__field"><span>Curation note (private — e.g. why this is public domain)</span>
              <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
            <label className="ad__field">
              <span>Status</span>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "draft" | "published" })}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (live)</option>
              </select>
            </label>
            <div className="ad__actions">
              <button className="ad__btn" disabled={!draft.source_id.trim() || draftVerify === "checking"} onClick={() => checkSource(draft.source_type, draft.source_id.trim())}>
                {draftVerify === "checking" ? "Checking…" : "Verify source"}
              </button>
              {draftVerify && draftVerify !== "checking" && (
                <span className={draftVerify.ok ? "ad__ok" : "ad__bad"}>{draftVerify.ok ? "✓" : "✗"} {draftVerify.why}</span>
              )}
            </div>
            <div className="ad__actions">
              <button className="ad__btn ad__btn--primary" disabled={busy} onClick={commit}><Icon name="check" size={14} /> Save film</button>
              <button className="ad__btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {films.map((f) => {
              const v = verify[`${f.source_type}:${f.source_id}`];
              return (
                <div className="ad__row" key={f.id}>
                  <span className="ad__cat">{f.status}</span>
                  <span className="ad__name">{f.title} <span style={{ color: "var(--muted2)", fontWeight: 400 }}>({f.year})</span></span>
                  <span className="ad__meta">{f.source_type}:{f.source_id}</span>
                  {v && v !== "checking" && <span className={v.ok ? "ad__ok" : "ad__bad"} title={v.why}>{v.ok ? "✓" : "✗"}</span>}
                  <button className="ad__mini" disabled={v === "checking"} onClick={() => checkSource(f.source_type, f.source_id)}>{v === "checking" ? "…" : "Verify"}</button>
                  <button className="ad__mini" onClick={() => togglePublish(f)}>{f.status === "published" ? "Unpublish" : "Publish"}</button>
                  <button className="ad__mini" onClick={() => startEdit(f)}>Edit</button>
                  <button className="ad__mini ad__mini--x" onClick={() => remove(f)}>✕</button>
                </div>
              );
            })}
            {!films.length && <div className="ad__empty">No films yet — hit “Add film”.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------- pages ---------------------------------- */
type PageRow = { id: string; slug: string; title: string; content: string; status: "draft" | "published"; updated_at: string };
const EMPTY_PAGE: Omit<PageRow, "id" | "updated_at"> = { slug: "", title: "", content: "", status: "draft" };

function PagesTab() {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // page id, or "new"
  const [draft, setDraft] = useState(EMPTY_PAGE);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ pages?: PageRow[]; error?: string }>("/api/admin/pages");
    if (ok) { setPages(data.pages ?? []); setErr(null); } else setErr(data.error ?? "Could not load pages.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const startNew = () => { setDraft(EMPTY_PAGE); setEditing("new"); };
  const startEdit = (p: PageRow) => { setDraft({ slug: p.slug, title: p.title, content: p.content, status: p.status }); setEditing(p.id); };

  const commit = async () => {
    if (!draft.title.trim()) return;
    setBusy(true);
    const res = editing === "new"
      ? await api("/api/admin/pages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) })
      : await api("/api/admin/pages", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: editing, ...draft }) });
    setBusy(false);
    if (res.ok) { setEditing(null); load(); } else setErr(res.data.error ?? "Could not save page.");
  };

  const remove = async (p: PageRow) => {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await api(`/api/admin/pages?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
    load();
  };

  if (err && !pages.length && !loading) return <div className="ad__err">{err} — is the Supabase schema set up? See <code>supabase/schema.sql</code>.</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Pages <span className="ad__count">{pages.length}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> New page</button>
        </div>
        <p className="ad__hint">Published pages are live immediately at <code>/&lt;slug&gt;</code> — e.g. an "About" page becomes <code>/about</code>.</p>

        {editing !== null && (
          <div className="ad__card ad__card--edit">
            <div className="ad__grid2">
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="About Us" /></label>
              <label className="ad__field"><span>Slug (optional — auto from title)</span>
                <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="about" /></label>
            </div>
            <label className="ad__field"><span>Content — Markdown supported: **bold**, *italic*, # headings, [links](url), - lists</span>
              <textarea rows={14} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label>
            <label className="ad__field">
              <span>Status</span>
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as "draft" | "published" })}>
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published (live)</option>
              </select>
            </label>
            <div className="ad__actions">
              <button className="ad__btn ad__btn--primary" disabled={busy} onClick={commit}><Icon name="check" size={14} /> Save page</button>
              <button className="ad__btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {pages.map((p) => (
              <div className="ad__row" key={p.id}>
                <span className="ad__cat">{p.status}</span>
                <span className="ad__name">{p.title}</span>
                <span className="ad__meta">/{p.slug}</span>
                <button className="ad__mini" onClick={() => startEdit(p)}>Edit</button>
                <button className="ad__mini ad__mini--x" onClick={() => remove(p)}>✕</button>
              </div>
            ))}
            {!pages.length && <div className="ad__empty">No pages yet.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------- menus ----------------------------------- */
type NavLink = { id: string; location: string; label: string; url: string; sort_order: number; is_external: boolean };
const LOCATIONS: [string, string][] = [
  ["footer_explore", "Footer — Explore"],
  ["footer_support", "Footer — Support"],
  ["footer_legal", "Footer — Legal"],
  ["header", "Header"],
];
const EMPTY_LINK = { location: "footer_support", label: "", url: "", sort_order: 0, is_external: false };

function MenusTab() {
  const [links, setLinks] = useState<NavLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY_LINK);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ links?: NavLink[]; error?: string }>("/api/admin/nav");
    if (ok) { setLinks(data.links ?? []); setErr(null); } else setErr(data.error ?? "Could not load links.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft.label.trim() || !draft.url.trim()) return;
    const res = await api("/api/admin/nav", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    if (res.ok) { setDraft(EMPTY_LINK); load(); } else setErr(res.data.error ?? "Could not add link.");
  };
  const remove = async (l: NavLink) => {
    await api(`/api/admin/nav?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
    load();
  };

  if (err && !links.length && !loading) return <div className="ad__err">{err} — is the Supabase schema set up? See <code>supabase/schema.sql</code>.</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <h2>Menus &amp; footer links <span className="ad__count">{links.length}</span></h2>
        <p className="ad__hint">These populate the Footer columns (and header, once wired) directly on the live site.</p>

        <div className="ad__card ad__card--edit">
          <div className="ad__grid2">
            <label className="ad__field"><span>Section</span>
              <select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>
                {LOCATIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="ad__field"><span>Order</span>
              <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} /></label>
            <label className="ad__field"><span>Label</span>
              <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Contact Us" /></label>
            <label className="ad__field"><span>URL</span>
              <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="/contact or https://…" /></label>
          </div>
          <div className="ad__actions">
            <button className="ad__btn ad__btn--primary" onClick={add}><Icon name="plus" size={14} /> Add link</button>
          </div>
        </div>

        {loading ? <div className="empty">Loading…</div> : LOCATIONS.map(([id, label]) => {
          const group = links.filter((l) => l.location === id).sort((a, b) => a.sort_order - b.sort_order);
          if (!group.length) return null;
          return (
            <div key={id} style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: "var(--muted)" }}>{label}</h3>
              <div className="ad__list">
                {group.map((l) => (
                  <div className="ad__row" key={l.id}>
                    <span className="ad__name">{l.label}</span>
                    <span className="ad__meta">{l.url}</span>
                    <button className="ad__mini ad__mini--x" onClick={() => remove(l)}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/* ------------------------------- media ------------------------------------ */
type MediaRow = { id: string; name: string; url: string; size: number | null; mime_type: string | null; created_at: string };

function MediaTab() {
  const [items, setItems] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // Separate from loadErr on purpose: load() runs again right after every
  // upload (to refresh the list), and if it shared one error slot, a real
  // upload failure would get wiped out a moment later by that reload
  // succeeding — so the error would flash and vanish before anyone saw it.
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ media?: MediaRow[]; error?: string }>("/api/admin/media");
    if (ok) { setItems(data.media ?? []); setLoadErr(null); } else setLoadErr(data.error ?? "Could not load media.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true); setUploadErr(null);
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await api("/api/admin/media", { method: "POST", body: form });
      if (!res.ok) failures.push(`${file.name}: ${res.data.error ?? "Upload failed."}`);
    }
    await load();
    setBusy(false);
    if (failures.length) setUploadErr(failures.join("  ·  "));
  };

  const remove = async (m: MediaRow) => {
    if (!confirm(`Delete “${m.name}”?`)) return;
    await api(`/api/admin/media?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    load();
  };

  const copy = (url: string) => navigator.clipboard?.writeText(url).catch(() => {});

  if (loadErr && !items.length && !loading) return <div className="ad__err">{loadErr} — is the Supabase schema + storage bucket set up? See <code>supabase/schema.sql</code>.</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Media library <span className="ad__count">{items.length}</span></h2>
          <label className="ad__btn ad__btn--primary" style={{ cursor: "pointer" }}>
            <Icon name="plus" size={14} /> {busy ? "Uploading…" : "Upload files"}
            <input type="file" multiple hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
          </label>
        </div>
        <p className="ad__hint">Uploaded files are public — copy a URL to use it anywhere (a page, a blog post, etc.).</p>
        {uploadErr && <div className="ad__err" style={{ marginTop: 10 }}>{uploadErr}</div>}

        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__picker">
            {items.map((m) => (
              <div key={m.id} className="ad__pick" style={{ cursor: "default" }}>
                {m.mime_type?.startsWith("image/") ? <img alt="" src={m.url} /> : <div className="ad__thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="film" size={20} /></div>}
                <span title={m.name}>{m.name}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button className="ad__mini" onClick={() => copy(m.url)}>Copy URL</button>
                  <button className="ad__mini ad__mini--x" onClick={() => remove(m)}>✕</button>
                </div>
              </div>
            ))}
            {!items.length && <div className="ad__empty">No uploads yet.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ----------------------------- settings ------------------------------------ */
type Settings = {
  site_title: string; site_description: string; meta_keywords: string; contact_email: string;
  social: Record<string, string>; maintenance_mode: boolean;
};

function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  const load = useCallback(async () => {
    const { ok, data } = await api<Settings & { error?: string }>("/api/admin/settings");
    if (ok) setS(data); else setStatus({ kind: "err", msg: (data as any).error ?? "Could not load settings." });
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!s) return;
    setStatus({ kind: "saving" });
    const res = await api("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(s) });
    setStatus(res.ok ? { kind: "ok", msg: "Saved" } : { kind: "err", msg: (res.data as any).error ?? "Save failed" });
    if (res.ok) setTimeout(() => setStatus({ kind: "idle" }), 1800);
  };

  if (status.kind === "err" && !s) return <div className="ad__err">{status.msg} — is the Supabase schema set up? See <code>supabase/schema.sql</code>.</div>;
  if (!s) return <div className="empty">Loading…</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>SEO &amp; site settings</h2>
          <button className="ad__btn ad__btn--primary" onClick={save}><Icon name="check" size={14} /> Save</button>
        </div>
        <div className="ad__grid2">
          <label className="ad__field"><span>Site title</span>
            <input value={s.site_title} onChange={(e) => setS({ ...s, site_title: e.target.value })} /></label>
          <label className="ad__field"><span>Contact email</span>
            <input value={s.contact_email} onChange={(e) => setS({ ...s, contact_email: e.target.value })} /></label>
        </div>
        <label className="ad__field"><span>Meta description</span>
          <textarea rows={2} value={s.site_description} onChange={(e) => setS({ ...s, site_description: e.target.value })} /></label>
        <label className="ad__field"><span>Meta keywords (comma-separated)</span>
          <input value={s.meta_keywords} onChange={(e) => setS({ ...s, meta_keywords: e.target.value })} /></label>
        <div className="ad__grid2">
          {(["facebook", "twitter", "instagram", "youtube", "tiktok", "telegram"] as const).map((k) => (
            <label className="ad__field" key={k}><span style={{ textTransform: "capitalize" }}>{k}</span>
              <input value={s.social?.[k] ?? ""} onChange={(e) => setS({ ...s, social: { ...s.social, [k]: e.target.value } })} placeholder="https://…" /></label>
          ))}
        </div>
        <label className="ad__field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <input type="checkbox" checked={s.maintenance_mode} onChange={(e) => setS({ ...s, maintenance_mode: e.target.checked })} style={{ width: "auto" }} />
          <span>Maintenance mode</span>
        </label>
        {status.kind === "err" && <div className="ad__err" style={{ marginTop: 10 }}>{status.msg}</div>}
      </section>
    </div>
  );
}

/* ----------------------------- comments ------------------------------------ */
type CommentRow = { id: string; movie_id: string; name: string; body: string; rating: number | null; status: string; created_at: string };

function CommentsTab() {
  const [items, setItems] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ comments?: CommentRow[]; error?: string }>("/api/admin/comments");
    if (ok) { setItems(data.comments ?? []); setErr(null); } else setErr(data.error ?? "Could not load comments.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setCommentStatus = async (id: string, status: string) => {
    await api("/api/admin/comments", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  };
  const remove = async (id: string) => {
    await api(`/api/admin/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  };

  const visible = items.filter((c) => filter === "all" || c.status === filter);

  if (err && !items.length && !loading) return <div className="ad__err">{err} — is the Supabase schema set up? See <code>supabase/schema.sql</code>.</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Comments <span className="ad__count">{items.length}</span></h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>
        {loading ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {visible.map((c) => (
              <div className="ad__row" key={c.id}>
                <span className="ad__cat">{c.status}</span>
                <span className="ad__name">{c.name}{c.rating ? ` · ★${c.rating}` : ""}</span>
                <span className="ad__meta" style={{ flex: 1 }}>{c.body}</span>
                {c.status !== "approved" && <button className="ad__mini" onClick={() => setCommentStatus(c.id, "approved")}>Approve</button>}
                {c.status !== "rejected" && <button className="ad__mini" onClick={() => setCommentStatus(c.id, "rejected")}>Reject</button>}
                <button className="ad__mini ad__mini--x" onClick={() => remove(c.id)}>✕</button>
              </div>
            ))}
            {!visible.length && <div className="ad__empty">Nothing here.</div>}
          </div>
        )}
      </section>
    </div>
  );
}
