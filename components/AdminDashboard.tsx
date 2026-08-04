"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";
import type { Movie, SiteConfig, RowConfig, Blog } from "@/lib/types";
import { poster } from "@/lib/images";

type Tab = "hero" | "rows" | "blog" | "catalogue";
const TABS: [Tab, string, string][] = [
  ["hero", "Hero Slides", "sparkle"],
  ["rows", "Home Rows", "grid"],
  ["blog", "Blog Posts", "article"],
  ["catalogue", "Catalogue", "film"],
];

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("hero");
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch("/api/admin/site").then((r) => r.json()),
      fetch("/api/admin/catalogue").then((r) => r.json()),
    ]);
    if (s?.error) setStatus({ kind: "err", msg: s.error });
    else setSite(s);
    setMovies(c?.movies ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (next: SiteConfig) => {
    setSite(next);
    setStatus({ kind: "saving" });
    const res = await fetch("/api/admin/site", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    });
    const data = await res.json();
    setStatus(res.ok ? { kind: "ok", msg: "Saved" } : { kind: "err", msg: data.error ?? "Save failed" });
    if (res.ok) setTimeout(() => setStatus({ kind: "idle" }), 1800);
  };

  if (status.kind === "err" && !site) {
    return <div className="ad__err">{status.msg}</div>;
  }
  if (!site) return <div className="empty">Loading dashboard…</div>;

  return (
    <div className="ad">
      <div className="ad__head">
        <div>
          <h1>Dashboard</h1>
          <p>Manage what appears on the site. Changes save straight to <code>content/</code>.</p>
        </div>
        <div className={`ad__status ad__status--${status.kind}`}>
          {status.kind === "saving" && "Saving…"}
          {status.kind === "ok" && <><Icon name="check" size={14} /> {status.msg}</>}
          {status.kind === "err" && <>⚠ {status.msg}</>}
        </div>
      </div>

      <div className="ad__tabs">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={`ad__tab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>
            <Icon name={icon} size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "hero" && <HeroTab site={site} movies={movies} save={save} />}
      {tab === "rows" && <RowsTab site={site} movies={movies} save={save} />}
      {tab === "blog" && <BlogTab site={site} save={save} />}
      {tab === "catalogue" && <CatalogueTab movies={movies} reload={load} />}
    </div>
  );
}

/* ------------------------------- hero ---------------------------------- */
function HeroTab({ site, movies, save }: { site: SiteConfig; movies: Movie[]; save: (s: SiteConfig) => void }) {
  const slides = site.hero?.slides ?? [];
  const toggle = (id: string) => {
    const next = slides.includes(id) ? slides.filter((s) => s !== id) : [...slides, id];
    save({ ...site, hero: { ...site.hero, slides: next } });
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = slides.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= slides.length) return;
    const next = slides.slice(); [next[i], next[j]] = [next[j], next[i]];
    save({ ...site, hero: { ...site.hero, slides: next } });
  };

  return (
    <div className="ad__body">
      <section className="ad__panel">
        <h2>Slides <span className="ad__count">{slides.length}</span></h2>
        <p className="ad__hint">Shown in order. These rotate on the home page.</p>
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
            onChange={(e) => save({ ...site, hero: { ...site.hero, intervalMs: Math.max(2, Number(e.target.value)) * 1000 } })} />
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
function RowsTab({ site, movies, save }: { site: SiteConfig; movies: Movie[]; save: (s: SiteConfig) => void }) {
  const rows = site.rows ?? [];
  const update = (i: number, patch: Partial<RowConfig>) => {
    const next = rows.slice(); next[i] = { ...next[i], ...patch };
    save({ ...site, rows: next });
  };
  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= rows.length) return;
    const next = rows.slice(); [next[i], next[j]] = [next[j], next[i]];
    save({ ...site, rows: next });
  };
  const addRow = () => save({
    ...site,
    rows: [...rows, { id: `row-${Date.now()}`, title: "New Row", mode: "auto", rule: { kind: "all", sort: "year", limit: 6 }, style: "plain" }],
  });
  const removeRow = (i: number) => save({ ...site, rows: rows.filter((_, x) => x !== i) });

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
              <input className="ad__title" value={row.title} onChange={(e) => update(i, { title: e.target.value })} />
              <button className="ad__mini" onClick={() => moveRow(i, -1)} disabled={i === 0}>↑</button>
              <button className="ad__mini" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}>↓</button>
              <button className="ad__mini ad__mini--x" onClick={() => removeRow(i)}>✕</button>
            </div>

            <div className="ad__controls">
              <label className="ad__field">
                <span>Mode</span>
                <select value={row.mode} onChange={(e) => update(i, { mode: e.target.value as RowConfig["mode"] })}>
                  <option value="auto">Auto (by rule)</option>
                  <option value="live">Live (from TMDB)</option>
                  <option value="manual">Manual (hand-picked)</option>
                </select>
              </label>

              {row.mode === "live" && (
                <label className="ad__field">
                  <span>Source</span>
                  <select value={row.live ?? "trending"} onChange={(e) => update(i, { live: e.target.value as RowConfig["live"] })}>
                    <option value="trending">Trending now</option>
                    <option value="latest">Latest releases</option>
                  </select>
                </label>
              )}

              {row.mode === "auto" || row.mode === "live" ? (
                <>
                  <label className="ad__field">
                    <span>Type</span>
                    <select value={row.rule?.kind ?? "all"} onChange={(e) => update(i, { rule: { ...row.rule, kind: e.target.value as "all" | "movie" | "series" } })}>
                      <option value="all">All</option><option value="movie">Movies</option><option value="series">Web Series</option>
                    </select>
                  </label>
                  {row.mode === "auto" && (
                    <label className="ad__field">
                      <span>Sort by</span>
                      <select value={row.rule?.sort ?? "year"} onChange={(e) => update(i, { rule: { ...row.rule, sort: e.target.value as "year" | "rating" | "votes" | "az" } })}>
                        <option value="year">Newest first</option><option value="rating">Highest rated</option>
                        <option value="votes">Most popular</option><option value="az">A–Z</option>
                      </select>
                    </label>
                  )}
                  <label className="ad__field">
                    <span>Show</span>
                    <input type="number" min={1} max={20} value={row.rule?.limit ?? 6}
                      onChange={(e) => update(i, { rule: { ...row.rule, limit: Number(e.target.value) } })} />
                  </label>
                </>
              ) : null}

              <label className="ad__field">
                <span>Style</span>
                <select value={row.style ?? "plain"} onChange={(e) => update(i, { style: e.target.value as RowConfig["style"] })}>
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
                      onClick={() => update(i, { items: on ? (row.items ?? []).filter((x) => x !== m.id) : [...(row.items ?? []), m.id] })}>
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

/* ------------------------------- blog ---------------------------------- */
const EMPTY_POST: Blog = { slug: "", title: "", cat: "Guide", excerpt: "", date: "", read: "5 min", body: [""] };

function BlogTab({ site, save }: { site: SiteConfig; save: (s: SiteConfig) => void }) {
  const posts = site.blog ?? [];
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Blog>(EMPTY_POST);

  const startNew = () => {
    setDraft({ ...EMPTY_POST, date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
    setEditing(-1);
  };
  const startEdit = (i: number) => { setDraft({ ...posts[i], body: posts[i].body ?? [posts[i].excerpt] }); setEditing(i); };
  const remove = (i: number) => save({ ...site, blog: posts.filter((_, x) => x !== i) });

  const commit = () => {
    const post: Blog = { ...draft, slug: draft.slug || slugify(draft.title) };
    if (!post.title.trim()) return;
    const next = editing === -1 ? [post, ...posts] : posts.map((p, i) => (i === editing ? post : p));
    save({ ...site, blog: next });
    setEditing(null);
  };

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Blog posts <span className="ad__count">{posts.length}</span></h2>
          <button className="ad__btn" onClick={startNew}><Icon name="plus" size={14} /> New post</button>
        </div>

        {editing !== null && (
          <div className="ad__card ad__card--edit">
            <div className="ad__grid2">
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Post title" /></label>
              <label className="ad__field"><span>Category</span>
                <input value={draft.cat} onChange={(e) => setDraft({ ...draft, cat: e.target.value })} placeholder="Guide" /></label>
              <label className="ad__field"><span>Date</span>
                <input value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} placeholder="Aug 1, 2024" /></label>
              <label className="ad__field"><span>Read time</span>
                <input value={draft.read} onChange={(e) => setDraft({ ...draft, read: e.target.value })} placeholder="8 min" /></label>
            </div>
            <label className="ad__field"><span>Excerpt</span>
              <textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} /></label>
            <label className="ad__field"><span>Body — one paragraph per blank-line-separated block</span>
              <textarea rows={9} value={(draft.body ?? []).join("\n\n")}
                onChange={(e) => setDraft({ ...draft, body: e.target.value.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean) })} /></label>
            <div className="ad__actions">
              <button className="ad__btn ad__btn--primary" onClick={commit}><Icon name="check" size={14} /> Save post</button>
              <button className="ad__btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="ad__list">
          {posts.map((p, i) => (
            <div className="ad__row" key={p.slug + i}>
              <span className="ad__cat">{p.cat}</span>
              <span className="ad__name">{p.title}</span>
              <span className="ad__meta">{p.date} · {p.read}</span>
              <button className="ad__mini" onClick={() => startEdit(i)}>Edit</button>
              <button className="ad__mini ad__mini--x" onClick={() => remove(i)}>✕</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ----------------------------- catalogue -------------------------------- */
function CatalogueTab({ movies, reload }: { movies: Movie[]; reload: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Movie[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(res.ok ? `Added “${d.movie.title}”. Restart dev server to see it.` : d.error);
    setBusy(false);
    if (res.ok) reload();
  };

  const remove = async (m: Movie) => {
    if (!confirm(`Remove “${m.title}” from the catalogue?`)) return;
    setBusy(true);
    await fetch(`/api/admin/catalogue?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    setBusy(false); reload();
  };

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <h2>Add a title</h2>
        <p className="ad__hint">Search TMDB and add it to your catalogue — full details and artwork come with it.</p>
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

      <section className="ad__panel">
        <h2>In your catalogue <span className="ad__count">{movies.length}</span></h2>
        <div className="ad__list">
          {movies.map((m) => (
            <div className="ad__row" key={m.id}>
              <img className="ad__thumb" alt="" src={poster(m)} />
              <span className="ad__name">{m.title}</span>
              <span className="ad__meta">{m.year} · {m.kind === "series" ? "Series" : "Film"} · ★ {m.rating.toFixed(1)}</span>
              <button className="ad__mini ad__mini--x" onClick={() => remove(m)}>✕</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
