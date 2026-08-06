"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import type { Movie, SiteConfig, RowConfig, Blog } from "@/lib/types";
import { poster } from "@/lib/images";
import { supabaseBrowser } from "@/lib/supabase/client";

type Tab = "hero" | "rows" | "blog" | "catalogue" | "pages" | "menus" | "media" | "settings" | "comments";
const TABS: [Tab, string, string][] = [
  ["hero", "Hero Slides", "sparkle"],
  ["rows", "Home Rows", "grid"],
  ["blog", "Blog Posts", "article"],
  ["catalogue", "Catalogue", "film"],
  ["pages", "Pages", "article"],
  ["menus", "Menus & Footer", "grid"],
  ["media", "Media Library", "film"],
  ["settings", "SEO & Settings", "sparkle"],
  ["comments", "Comments", "article"],
];

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("hero");
  const [site, setSite] = useState<SiteConfig | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  const logout = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/admin/login");
    router.refresh();
  };

  // Hero/Rows/Blog/Catalogue write to local files on disk (content/*.json),
  // which only works in `npm run dev` — on Vercel the filesystem is
  // read-only per request, so these four intentionally 403 in production.
  // That must NOT block the rest of the dashboard: Pages/Menus/Media/
  // Settings/Comments are Supabase-backed and work live regardless.
  const [fileBackedErr, setFileBackedErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, c] = await Promise.all([
      fetch("/api/admin/site").then((r) => r.json()).catch(() => ({ error: "Could not reach the server." })),
      fetch("/api/admin/catalogue").then((r) => r.json()).catch(() => ({ movies: [] })),
    ]);
    if (s?.error) setFileBackedErr(s.error);
    else { setFileBackedErr(null); setSite(s); }
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

  const FILE_TABS: Tab[] = ["hero", "rows", "blog", "catalogue"];

  return (
    <div className="ad">
      <div className="ad__head">
        <div>
          <h1>Dashboard</h1>
          <p>Pages, menus, media, SEO, and comments update your live site instantly. Hero Slides, Home Rows, Blog Posts, and Catalogue are edited in local development only.</p>
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

      {FILE_TABS.includes(tab) && fileBackedErr ? (
        <div className="ad__err">{fileBackedErr} — this tab only works when running <code>npm run dev</code> locally.</div>
      ) : (
        <>
          {tab === "hero" && site && <HeroTab site={site} movies={movies} save={save} />}
          {tab === "rows" && site && <RowsTab site={site} movies={movies} save={save} />}
          {tab === "blog" && site && <BlogTab site={site} save={save} />}
          {tab === "catalogue" && <CatalogueTab movies={movies} reload={load} />}
        </>
      )}
      {tab === "pages" && <PagesTab />}
      {tab === "menus" && <MenusTab />}
      {tab === "media" && <MediaTab />}
      {tab === "settings" && <SettingsTab />}
      {tab === "comments" && <CommentsTab />}
    </div>
  );
}

/* ------------------------- shared: live/Supabase fetch helper ---------- */
async function api<T = any>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
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
        <p className="ad__hint">Published pages are live immediately at <code>/p/&lt;slug&gt;</code> — e.g. an "About" page becomes <code>/p/about</code>.</p>

        {editing !== null && (
          <div className="ad__card ad__card--edit">
            <div className="ad__grid2">
              <label className="ad__field"><span>Title</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="About Us" /></label>
              <label className="ad__field"><span>Slug (optional — auto from title)</span>
                <input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} placeholder="about" /></label>
            </div>
            <label className="ad__field"><span>Content</span>
              <textarea rows={10} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} /></label>
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
                <span className="ad__meta">/p/{p.slug}</span>
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
              <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="/p/contact or https://…" /></label>
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
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { ok, data } = await api<{ media?: MediaRow[]; error?: string }>("/api/admin/media");
    if (ok) { setItems(data.media ?? []); setErr(null); } else setErr(data.error ?? "Could not load media.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true); setErr(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await api("/api/admin/media", { method: "POST", body: form });
      if (!res.ok) setErr(res.data.error ?? "Upload failed.");
    }
    setBusy(false);
    load();
  };

  const remove = async (m: MediaRow) => {
    if (!confirm(`Delete “${m.name}”?`)) return;
    await api(`/api/admin/media?id=${encodeURIComponent(m.id)}`, { method: "DELETE" });
    load();
  };

  const copy = (url: string) => navigator.clipboard?.writeText(url).catch(() => {});

  if (err && !items.length && !loading) return <div className="ad__err">{err} — is the Supabase schema + storage bucket set up? See <code>supabase/schema.sql</code>.</div>;

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
          {(["facebook", "twitter", "instagram", "youtube"] as const).map((k) => (
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
