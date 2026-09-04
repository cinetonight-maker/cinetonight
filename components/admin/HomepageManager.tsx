"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api, cacheNote, type Revalidated } from "./shared";
import {
  normalizeConfig, visibleSections, describeConfig,
  SECTION_META, ALL_SECTIONS, DEFAULT_CONFIG,
  type HomepageConfig, type SectionId,
} from "@/lib/homepageConfig";

/* ============================================================================
 * /admin/homepage — Stage 5, the first configuration manager.
 *
 * Live version · Draft changes · Preview · Publish · Rollback.
 *
 * Editing here changes NOTHING on the site. The public homepage reads
 * `live_config`; everything on this screen writes `draft_config`. Publish is
 * the only action that swaps them, and it snapshots the version it replaced.
 *
 * What is NOT here, deliberately: the hero question, Quick Picks, moods and
 * the single recommendation. That spine is locked by the Phase 3 design —
 * making it switchable would let one click turn the homepage back into the
 * shelf-stack it stopped being.
 * ========================================================================= */

interface Movie { id: string; title: string; posterPath?: string | null }

interface Loaded {
  live: HomepageConfig; draft: HomepageConfig;
  revisions: { id: string; note: string | null; author: string | null; created_at: string }[];
  dirty: boolean; problems: string[]; usingDefault: boolean;
  draftSavedAt: string | null; publishedAt: string | null; publishedBy: string | null;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

export default function HomepageManager() {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<HomepageConfig>(DEFAULT_CONFIG);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved">("idle");
  const [showHistory, setShowHistory] = useState(false);
  const [heroSearch, setHeroSearch] = useState("");

  const load = useCallback(async () => {
    const [cfg, cat] = await Promise.all([
      api<Loaded & { error?: string }>("/api/admin/homepage"),
      api<{ movies?: Movie[] }>("/api/admin/catalogue"),
    ]);
    if (cfg.ok) { setData(cfg.data); setDraft(normalizeConfig(cfg.data.draft)); setErr(null); }
    else setErr(cfg.data.error ?? "Could not load the homepage settings.");
    if (cat.ok) setMovies(cat.data.movies ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(
    () => !!data && JSON.stringify(normalizeConfig(data.live)) !== JSON.stringify(normalizeConfig(draft)),
    [data, draft],
  );

  /* Autosave the DRAFT. It cannot touch the live site — the public page reads
     a different column — so this is safe to run while you are still deciding. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!data || !dirty) return;
    const t = setTimeout(async () => {
      setAutoState("saving");
      const res = await api("/api/admin/homepage", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveDraft", config: draftRef.current }),
      });
      setAutoState(res.ok ? "saved" : "idle");
    }, 2500);
    return () => clearTimeout(t);
  }, [draft, dirty, data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* ------------------------------- editing ------------------------------ */
  const setSection = (id: SectionId, patch: Partial<HomepageConfig["sections"][SectionId]>) =>
    setDraft((d) => normalizeConfig({ ...d, sections: { ...d.sections, [id]: { ...d.sections[id], ...patch } } }));

  const move = (id: SectionId, dir: -1 | 1) =>
    setDraft((d) => {
      const order = [...d.order];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return normalizeConfig({ ...d, order });
    });

  const toggleHero = (id: string) =>
    setDraft((d) => {
      const picks = d.hero.picks.includes(id) ? d.hero.picks.filter((p) => p !== id) : [...d.hero.picks, id];
      // Spread the existing hero: without it, toggling a poster would drop the
      // edited headline and paragraph and silently reset them to the defaults.
      return normalizeConfig({ ...d, hero: { ...d.hero, picks } });
    });

  /* ------------------------------- actions ------------------------------ */
  const publish = async () => {
    if (!confirm("Publish this homepage? The current version is saved to history first, so you can put it back.")) return;
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ error?: string; revalidated?: Revalidated }>("/api/admin/homepage", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", config: draft }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not publish."); return; }
    setNote(`Homepage published.${cacheNote(res.data.revalidated ?? null)}`);
    setAutoState("idle");
    load();
  };

  const discard = async () => {
    if (!confirm("Throw away your unpublished changes and start again from the live homepage?")) return;
    await api("/api/admin/homepage", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "discardDraft" }),
    });
    setNote("Draft discarded - you are back to the live version."); setAutoState("idle");
    load();
  };

  const rollback = async (id: string, label: string) => {
    if (!confirm(`Load the version from ${label}?\n\nIt comes back as a DRAFT - nothing on the site changes until you press Publish.`)) return;
    const res = await api<{ note?: string; error?: string }>("/api/admin/homepage", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rollback", revisionId: id }),
    });
    if (!res.ok) { setErr(res.data.error ?? "Could not load that version."); return; }
    setNote(res.data.note ?? "Loaded as a draft."); setShowHistory(false);
    load();
  };

  if (err && !data) return <div className="ad__err">{err}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  const problems = (() => {
    const v = visibleSections(draft);
    const out: string[] = [];
    if (!v.length) out.push("Every section is switched off. The homepage would be just the hero and the picker.");
    return out;
  })();

  const heroMatches = movies
    .filter((m) => !heroSearch || m.title.toLowerCase().includes(heroSearch.toLowerCase()))
    .slice(0, 24);

  return (
    <div className="ad__body ad__body--one">
      {/* ---------------------------- status bar --------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Homepage</h2>
          <div className="ad__headright">
            {autoState === "saving" && <span className="ad__meta">Saving draft…</span>}
            {autoState === "saved" && <span className="ad__meta">Draft autosaved</span>}
            {dirty
              ? <span className="ad__meta ad__meta--warn">Unpublished changes</span>
              : <span className="ad__meta">Live version</span>}
            <button className="ad__mini" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "Hide history" : "History"}
            </button>
          </div>
        </div>

        <div className="hpm__state">
          <div className="hpm__col">
            <span className="ovh__l">Live now</span>
            <b>{describeConfig(data.live)}</b>
            <span className="ovh__n">
              {data.usingDefault ? "Never published - showing the shipped default" : `Published ${when(data.publishedAt)}${data.publishedBy ? ` by ${data.publishedBy}` : ""}`}
            </span>
          </div>
          <div className="hpm__col">
            <span className="ovh__l">Your draft</span>
            <b>{describeConfig(draft)}</b>
            <span className="ovh__n">{dirty ? `Not published${data.draftSavedAt ? ` · saved ${when(data.draftSavedAt)}` : ""}` : "Identical to what is live"}</span>
          </div>
        </div>

        {problems.length > 0 && (
          <div className="ad__notice ad__notice--warn">
            <b>Not ready to publish.</b> {problems[0]}
          </div>
        )}
        {err && <div className="ad__err" style={{ marginTop: 10 }}>{err}</div>}
        {note && !err && <div className="ad__ok" style={{ marginTop: 10 }}>{note}</div>}

        <div className="ad__actions">
          <button className="ad__btn ad__btn--primary" disabled={busy || !dirty || problems.length > 0} onClick={publish}>
            <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish homepage"}
          </button>
          <a className="ad__btn" href="/admin/preview/homepage" target="_blank" rel="noreferrer">Preview draft</a>
          <a className="ad__btn" href="/" target="_blank" rel="noreferrer">View live homepage</a>
          {dirty && <button className="ad__btn" onClick={discard}>Discard changes</button>}
        </div>
        <p className="ad__hintline">
          Nothing here changes the site until you press Publish. Your edits are saved as a draft that only you can see.
        </p>
      </section>

      {showHistory && (
        <section className="ad__panel">
          <div className="ad__panelhead"><h2>Previous homepages <span className="ad__count">{data.revisions.length}</span></h2></div>
          <p className="ad__hintline">
            Every publish saves the version it replaced. Restoring brings one back as a <b>draft</b> - you preview it and
            publish it deliberately, so a rollback is never an unpreviewed change.
          </p>
          <div className="ad__list">
            {data.revisions.map((r) => (
              <div className="ad__row" key={r.id}>
                <span className="ad__cat">saved</span>
                <span className="ad__name">{r.note ?? "Homepage version"}</span>
                <span className="ad__meta">{when(r.created_at)}{r.author ? ` · ${r.author}` : ""}</span>
                <button className="ad__mini" onClick={() => rollback(r.id, when(r.created_at))}>Load as draft</button>
              </div>
            ))}
            {!data.revisions.length && <div className="ad__empty">No previous versions yet. The first publish creates one.</div>}
          </div>
        </section>
      )}

      {/* ------------------------------ hero ------------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Hero <span className="ad__count">{draft.hero.picks.length || "auto"}</span></h2>
          {draft.hero.picks.length > 0 && (
            <button className="ad__mini" onClick={() => setDraft((d) => normalizeConfig({ ...d, hero: { ...d.hero, picks: [] } }))}>
              Back to automatic
            </button>
          )}
        </div>
        <div className="ad__grid2" style={{ marginBottom: 14 }}>
          <label className="ad__field">
            <span>Headline (the page&rsquo;s H1 - the last two words are highlighted)</span>
            <input value={draft.hero.title ?? ""} maxLength={120}
              onChange={(e) => setDraft((d) => normalizeConfig({ ...d, hero: { ...d.hero, title: e.target.value } }))} />
          </label>
          <label className="ad__field">
            <span>Paragraph under it</span>
            <input value={draft.hero.sub ?? ""} maxLength={260}
              onChange={(e) => setDraft((d) => normalizeConfig({ ...d, hero: { ...d.hero, sub: e.target.value } }))} />
          </label>
        </div>
        <p className="ad__hintline">
          Leave this empty and the hero uses whatever is trending - it never goes stale, which is why it is the default.
          Pick titles only when you want a specific look for a while. Up to 8.
        </p>
        <input className="ad__search" value={heroSearch} placeholder="Search your catalogue…"
          onChange={(e) => setHeroSearch(e.target.value)} style={{ marginBottom: 10 }} />
        <div className="ad__picker ad__picker--sm">
          {heroMatches.map((m) => {
            const on = draft.hero.picks.includes(m.id);
            return (
              <button key={m.id} type="button" className={`ad__pick${on ? " on" : ""}`} onClick={() => toggleHero(m.id)}>
                {m.posterPath ? <img alt="" src={m.posterPath} /> : <span className="ad__thumb" />}
                <span title={m.title}>{m.title}</span>
                {on && <em><Icon name="check" size={13} /></em>}
              </button>
            );
          })}
          {!heroMatches.length && <div className="ad__empty">No titles match “{heroSearch}”.</div>}
        </div>
      </section>

      {/* ---------------------------- sections ----------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Sections <span className="ad__count">{visibleSections(draft).length} of {ALL_SECTIONS.length} on</span></h2>
        </div>
        <p className="ad__hintline">
          The order here is the order on the page, top to bottom. The hero question and the picker above them are fixed -
          they are what the homepage is for.
        </p>

        <div className="hpm__sections">
          {draft.order.map((id, i) => {
            const meta = SECTION_META[id];
            const s = draft.sections[id];
            return (
              <div className={`hpm__sec${s.on ? "" : " hpm__sec--off"}`} key={id}>
                <div className="hpm__sechead">
                  <span className="hpm__pos">{i + 1}</span>
                  <div className="hpm__secmain">
                    <b>{meta.label}</b>
                    <span>{meta.what}</span>
                  </div>
                  <div className="hpm__secbtns">
                    <button className="ad__mini" disabled={i === 0} onClick={() => move(id, -1)} aria-label="Move up">↑</button>
                    <button className="ad__mini" disabled={i === draft.order.length - 1} onClick={() => move(id, 1)} aria-label="Move down">↓</button>
                    <button className={`ad__mini${s.on ? "" : " ad__mini--x"}`} onClick={() => setSection(id, { on: !s.on })}>
                      {s.on ? "On" : "Off"}
                    </button>
                  </div>
                </div>

                {s.on && (meta.hasText || meta.count) && (
                  <div className="hpm__secbody">
                    {meta.hasText && (
                      <>
                        <label className="ad__field">
                          <span>Heading</span>
                          <input value={s.title ?? ""} onChange={(e) => setSection(id, { title: e.target.value })} />
                        </label>
                        <label className="ad__field">
                          <span>Sub-heading</span>
                          <input value={s.sub ?? ""} onChange={(e) => setSection(id, { sub: e.target.value })} />
                        </label>
                      </>
                    )}
                    {meta.count && (
                      <label className="ad__field hpm__count">
                        <span>How many {meta.count.unit} ({meta.count.min}–{meta.count.max})</span>
                        <input type="number" min={meta.count.min} max={meta.count.max}
                          value={s.count ?? meta.count.default}
                          onChange={(e) => setSection(id, { count: Number(e.target.value) })} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
