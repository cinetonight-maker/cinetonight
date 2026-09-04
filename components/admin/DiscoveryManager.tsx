"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api, cacheNote, type Revalidated } from "./shared";
import {
  normalizeConfig, validateConfig, describeConfig,
  enabledMoods, enabledQuickPicks, enabledExploreTabs, enabledProviders,
  BUILTIN, RULE_SUMMARY, MOOD_IDS, DEFAULT_CONFIG,
  type DiscoveryConfig, type MoodId, type QuickPickId, type ExploreTabId, type EntryConfig,
} from "@/lib/discoveryConfig";

/* ============================================================================
 * /admin/discovery — Stage 6.
 *
 * The moods, Quick Picks, Explore tabs and Tonight's Pick rules, editable
 * without code. Same configuration-manager contract as the Homepage:
 * live · draft · preview · publish · rollback · audit.
 *
 * WHAT YOU CAN CHANGE: labels, icons, order, on/off, and the Tonight's Pick
 * rules. WHAT YOU CANNOT: the ids, and the genre/rating rules behind them.
 * The screen SHOWS each locked rule rather than hiding it — a control that
 * conceals its own constraints is worse than one that has none.
 * ========================================================================= */

interface Loaded {
  live: DiscoveryConfig; draft: DiscoveryConfig;
  revisions: { id: string; note: string | null; author: string | null; created_at: string }[];
  dirty: boolean; problems: string[]; usingDefault: boolean;
  draftSavedAt: string | null; publishedAt: string | null; publishedBy: string | null;
}

type GroupKey = "moods" | "quickPicks" | "explore" | "providers";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function DiscoveryManager() {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<DiscoveryConfig>(DEFAULT_CONFIG);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved">("idle");
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Loaded & { error?: string }>("/api/admin/discovery");
    if (res.ok) { setData(res.data); setDraft(normalizeConfig(res.data.draft)); setErr(null); }
    else setErr(res.data.error ?? "Could not load the discovery settings.");
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(
    () => !!data && JSON.stringify(normalizeConfig(data.live)) !== JSON.stringify(normalizeConfig(draft)),
    [data, draft],
  );
  const problems = useMemo(() => validateConfig(draft), [draft]);

  /* Draft autosave. Writes `draft_config`, which the public site never reads. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!data || !dirty) return;
    const t = setTimeout(async () => {
      setAutoState("saving");
      const res = await api("/api/admin/discovery", {
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
  const setEntry = (group: GroupKey, id: string, patch: Partial<EntryConfig>) =>
    setDraft((d) => normalizeConfig({
      ...d,
      [group]: {
        ...d[group],
        entries: { ...d[group].entries, [id]: { ...(d[group].entries as never as Record<string, EntryConfig>)[id], ...patch } },
      },
    }));

  const move = (group: GroupKey, id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const order = [...(d[group].order as string[])];
      const i = order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return d;
      [order[i], order[j]] = [order[j], order[i]];
      return normalizeConfig({ ...d, [group]: { ...d[group], order } });
    });

  const setTonight = (patch: Partial<DiscoveryConfig["tonight"]>) =>
    setDraft((d) => normalizeConfig({ ...d, tonight: { ...d.tonight, ...patch } }));

  /* ------------------------------- actions ------------------------------ */
  const publish = async () => {
    if (!confirm("Publish these discovery settings? The current version is saved to history first, so you can put it back.")) return;
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ error?: string; revalidated?: Revalidated }>("/api/admin/discovery", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", config: draft }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not publish."); return; }
    setNote(`Discovery settings published.${cacheNote(res.data.revalidated ?? null)}`);
    setAutoState("idle"); load();
  };

  const discard = async () => {
    if (!confirm("Throw away your unpublished changes and start again from what is live?")) return;
    await api("/api/admin/discovery", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "discardDraft" }),
    });
    setNote("Draft discarded — you are back to the live version."); setAutoState("idle"); load();
  };

  const rollback = async (id: string, label: string) => {
    if (!confirm(`Load the version from ${label}?\n\nIt comes back as a DRAFT — nothing changes on the site until you press Publish.`)) return;
    const res = await api<{ note?: string; error?: string }>("/api/admin/discovery", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rollback", revisionId: id }),
    });
    if (!res.ok) { setErr(res.data.error ?? "Could not load that version."); return; }
    setNote(res.data.note ?? "Loaded as a draft."); setShowHistory(false); load();
  };

  if (err && !data) return <div className="ad__err">{err}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  return (
    <div className="ad__body ad__body--one">
      {/* ---------------------------- status ------------------------------ */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Discovery</h2>
          <div className="ad__headright">
            {autoState === "saving" && <span className="ad__meta">Saving draft…</span>}
            {autoState === "saved" && <span className="ad__meta">Draft autosaved</span>}
            {dirty ? <span className="ad__meta ad__meta--warn">Unpublished changes</span> : <span className="ad__meta">Live version</span>}
            <button className="ad__mini" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide history" : "History"}</button>
          </div>
        </div>

        <div className="hpm__state">
          <div className="hpm__col">
            <span className="ovh__l">Live now</span>
            <b>{describeConfig(data.live)}</b>
            <span className="ovh__n">
              {data.usingDefault ? "Never published — showing the shipped default" : `Published ${when(data.publishedAt)}${data.publishedBy ? ` by ${data.publishedBy}` : ""}`}
            </span>
          </div>
          <div className="hpm__col">
            <span className="ovh__l">Your draft</span>
            <b>{describeConfig(draft)}</b>
            <span className="ovh__n">{dirty ? `Not published${data.draftSavedAt ? ` · saved ${when(data.draftSavedAt)}` : ""}` : "Identical to what is live"}</span>
          </div>
        </div>

        {problems.length > 0 && (
          <div className="ad__notice ad__notice--warn"><b>Not ready to publish.</b> {problems[0]}</div>
        )}
        {err && <div className="ad__err" style={{ marginTop: 10 }}>{err}</div>}
        {note && !err && <div className="ad__ok" style={{ marginTop: 10 }}>{note}</div>}

        <div className="ad__actions">
          <button className="ad__btn ad__btn--primary" disabled={busy || !dirty || problems.length > 0} onClick={publish}>
            <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish discovery settings"}
          </button>
          <a className="ad__btn" href="/admin/preview/discovery" target="_blank" rel="noreferrer">Preview draft</a>
          <a className="ad__btn" href="/discover" target="_blank" rel="noreferrer">View live Discover</a>
          {dirty && <button className="ad__btn" onClick={discard}>Discard changes</button>}
        </div>
        <p className="ad__hintline">
          Nothing here changes the site until you press Publish. Switching something off hides it from visitors but keeps
          old links to it working — the web addresses never change, which is what keeps the site fast and cheap.
        </p>
      </section>

      {showHistory && (
        <section className="ad__panel">
          <div className="ad__panelhead"><h2>Previous versions <span className="ad__count">{data.revisions.length}</span></h2></div>
          <div className="ad__list">
            {data.revisions.map((r) => (
              <div className="ad__row" key={r.id}>
                <span className="ad__cat">saved</span>
                <span className="ad__name">{r.note ?? "Discovery version"}</span>
                <span className="ad__meta">{when(r.created_at)}{r.author ? ` · ${r.author}` : ""}</span>
                <button className="ad__mini" onClick={() => rollback(r.id, when(r.created_at))}>Load as draft</button>
              </div>
            ))}
            {!data.revisions.length && <div className="ad__empty">No previous versions yet. The first publish creates one.</div>}
          </div>
        </section>
      )}

      {/* -------------------------- Tonight's Pick ------------------------ */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Tonight&rsquo;s Pick</h2></div>
        <p className="ad__hintline">
          Rules, not a chosen film. A pinned title goes stale within days and makes the &ldquo;why it fits&rdquo; line
          untrue — so this steers the recommendation instead of replacing it.
        </p>
        <div className="ad__grid2">
          <label className="ad__field">
            <span>Lean towards a mood</span>
            <select value={draft.tonight.preferMood} onChange={(e) => setTonight({ preferMood: e.target.value as MoodId | "any" })}>
              <option value="any">No preference — pick from everything</option>
              {MOOD_IDS.map((id) => <option key={id} value={id}>{draft.moods.entries[id].label}</option>)}
            </select>
          </label>
          <label className="ad__field">
            <span>Minimum rating (0 = no floor)</span>
            <input type="number" min={0} max={9} step={0.5} value={draft.tonight.minRating}
              onChange={(e) => setTonight({ minRating: Number(e.target.value) })} />
          </label>
          <label className="ad__field">
            <span>Films or series</span>
            <select value={draft.tonight.kind} onChange={(e) => setTonight({ kind: e.target.value as "any" | "movie" | "series" })}>
              <option value="any">Either</option>
              <option value="movie">Films only</option>
              <option value="series">Series only</option>
            </select>
          </label>
        </div>
      </section>

      {/* ------------------------------ moods ----------------------------- */}
      <Group
        title="Moods"
        count={`${enabledMoods(draft).length} of ${draft.moods.order.length} on`}
        hint="The chips on the homepage picker. You can rename them, change the emoji and reorder them. What each mood actually selects is fixed — shown under each row — because the recommendation explains itself using those rules."
        ids={draft.moods.order}
        entry={(id) => draft.moods.entries[id as MoodId]}
        rule={(id) => RULE_SUMMARY.moods[id as MoodId]}
        onMove={(id, d) => move("moods", id, d)}
        onPatch={(id, p) => setEntry("moods", id, p)}
        iconField="emoji"
      />

      {/* --------------------------- quick picks -------------------------- */}
      <Group
        title="Quick Picks"
        count={`${enabledQuickPicks(draft).length} of ${draft.quickPicks.order.length} on`}
        hint="The one-tap starting points. Rename them and change the line underneath; the rating and runtime rules behind each are fixed."
        ids={draft.quickPicks.order}
        entry={(id) => draft.quickPicks.entries[id as QuickPickId]}
        rule={(id) => RULE_SUMMARY.quickPicks[id as QuickPickId]}
        onMove={(id, d) => move("quickPicks", id, d)}
        onPatch={(id, p) => setEntry("quickPicks", id, p)}
        hasSub
        iconField="icon"
      />

      {/* ------------------------ streaming services ---------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Streaming Services <span className="ad__count">{enabledProviders(draft).length} of {draft.providers.order.length} on</span></h2>
        </div>
        <p className="ad__hintline">
          The provider shortcuts on the homepage. The homepage shows the first eight that are on, in this order — so put
          the ones your readers actually subscribe to at the top. The web address of each service page never changes.
        </p>
        <div className="hpm__sections">
          {draft.providers.order.map((id, i) => {
            const e = draft.providers.entries[id];
            const inRow = enabledProviders(draft).indexOf(id);
            return (
              <div className={`hpm__sec${e.on ? "" : " hpm__sec--off"}`} key={id}>
                <div className="hpm__sechead">
                  <span className="hpm__pos">{i + 1}</span>
                  <div className="hpm__secmain">
                    <b>{e.label}</b>
                    <span>
                      /channel/{id}
                      {e.on && (inRow >= 0 && inRow < 8 ? " · shown on the homepage" : " · on, but past the first eight")}
                    </span>
                  </div>
                  <div className="hpm__secbtns">
                    <button className="ad__mini" disabled={i === 0} onClick={() => move("providers", id, -1)} aria-label="Move up">↑</button>
                    <button className="ad__mini" disabled={i === draft.providers.order.length - 1} onClick={() => move("providers", id, 1)} aria-label="Move down">↓</button>
                    <button className={`ad__mini${e.on ? "" : " ad__mini--x"}`} onClick={() => setEntry("providers", id, { on: !e.on })}>
                      {e.on ? "On" : "Off"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* -------------------------- explore tabs -------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Explore Tonight <span className="ad__count">{enabledExploreTabs(draft).length} of {draft.explore.order.length} on</span></h2>
        </div>
        <p className="ad__hintline">
          The industry tabs. Reorder them, rename them, and choose which one opens first.
        </p>
        <label className="ad__field" style={{ maxWidth: 280, marginBottom: 12 }}>
          <span>Tab that opens by default</span>
          <select value={draft.explore.defaultTab}
            onChange={(e) => setDraft((d) => normalizeConfig({ ...d, explore: { ...d.explore, defaultTab: e.target.value as ExploreTabId } }))}>
            {enabledExploreTabs(draft).map((id) => (
              <option key={id} value={id}>{draft.explore.entries[id].label}</option>
            ))}
          </select>
        </label>
        <div className="hpm__sections">
          {draft.explore.order.map((id, i) => {
            const e = draft.explore.entries[id];
            return (
              <div className={`hpm__sec${e.on ? "" : " hpm__sec--off"}`} key={id}>
                <div className="hpm__sechead">
                  <span className="hpm__pos">{i + 1}</span>
                  <div className="hpm__secmain">
                    <b>{e.label}</b>
                    <span>Internal name: {id} — fixed, because it is part of the web address</span>
                  </div>
                  <div className="hpm__secbtns">
                    <button className="ad__mini" disabled={i === 0} onClick={() => move("explore", id, -1)} aria-label="Move up">↑</button>
                    <button className="ad__mini" disabled={i === draft.explore.order.length - 1} onClick={() => move("explore", id, 1)} aria-label="Move down">↓</button>
                    <button className={`ad__mini${e.on ? "" : " ad__mini--x"}`} onClick={() => setEntry("explore", id, { on: !e.on })}>
                      {e.on ? "On" : "Off"}
                    </button>
                  </div>
                </div>
                {e.on && (
                  <div className="hpm__secbody">
                    <label className="ad__field">
                      <span>Label</span>
                      <input value={e.label ?? ""} onChange={(ev) => setEntry("explore", id, { label: ev.target.value })} />
                    </label>
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

/** A reorderable, toggleable list of entries whose RULE is shown but locked. */
function Group({
  title, count, hint, ids, entry, rule, onMove, onPatch, hasSub, iconField,
}: {
  title: string; count: string; hint: string; ids: readonly string[];
  entry: (id: string) => EntryConfig;
  rule: (id: string) => string | undefined;
  onMove: (id: string, dir: -1 | 1) => void;
  onPatch: (id: string, patch: Partial<EntryConfig>) => void;
  hasSub?: boolean;
  iconField: "emoji" | "icon";
}) {
  return (
    <section className="ad__panel">
      <div className="ad__panelhead"><h2>{title} <span className="ad__count">{count}</span></h2></div>
      <p className="ad__hintline">{hint}</p>
      <div className="hpm__sections">
        {ids.map((id, i) => {
          const e = entry(id);
          return (
            <div className={`hpm__sec${e.on ? "" : " hpm__sec--off"}`} key={id}>
              <div className="hpm__sechead">
                <span className="hpm__pos">{i + 1}</span>
                <div className="hpm__secmain">
                  <b>{iconField === "emoji" && e.icon ? `${e.icon} ` : ""}{e.label}</b>
                  <span className="dsm__rule">Fixed rule: {rule(id) ?? "—"}</span>
                </div>
                <div className="hpm__secbtns">
                  <button className="ad__mini" disabled={i === 0} onClick={() => onMove(id, -1)} aria-label="Move up">↑</button>
                  <button className="ad__mini" disabled={i === ids.length - 1} onClick={() => onMove(id, 1)} aria-label="Move down">↓</button>
                  <button className={`ad__mini${e.on ? "" : " ad__mini--x"}`} onClick={() => onPatch(id, { on: !e.on })}>
                    {e.on ? "On" : "Off"}
                  </button>
                </div>
              </div>
              {e.on && (
                <div className="hpm__secbody">
                  <label className="ad__field">
                    <span>Label</span>
                    <input value={e.label ?? ""} onChange={(ev) => onPatch(id, { label: ev.target.value })} />
                  </label>
                  <label className="ad__field">
                    <span>{iconField === "emoji" ? "Emoji" : "Icon name"}</span>
                    <input value={e.icon ?? ""} maxLength={8}
                      onChange={(ev) => onPatch(id, { icon: ev.target.value })} />
                  </label>
                  {hasSub && (
                    <label className="ad__field" style={{ gridColumn: "1 / -1" }}>
                      <span>Line underneath — describe the rule, not the films</span>
                      <input value={e.sub ?? ""} onChange={(ev) => onPatch(id, { sub: ev.target.value })} />
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
