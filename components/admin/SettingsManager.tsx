"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "./shared";
import {
  normalizeSettings, validateSettings, describeSettings,
  SOCIAL_KEYS, SOCIAL_LABEL, DEFAULTS,
  type SiteSettingsConfig,
} from "@/lib/settingsConfig";

/* ============================================================================
 * /admin/settings — the site's own details, on the same contract as everything
 * else: live · draft · publish · rollback · audit.
 *
 * These values appear on EVERY page (the title and description are in the root
 * layout), which is exactly why they get a draft rather than a live form that
 * saves as you type — the old screen changed the whole site the moment you
 * pressed Save.
 *
 * Not here on purpose: the newsletter heading (Homepage owns that block),
 * footer links (Navigation owns those), and the logo mark itself — it is a
 * vector component, not an image URL, so swapping it belongs in code review.
 * ========================================================================= */

interface Loaded {
  live: SiteSettingsConfig; draft: SiteSettingsConfig;
  revisions: { id: string; note: string | null; author: string | null; created_at: string }[];
  dirty: boolean; problems: string[];
  draftSavedAt: string | null; publishedAt: string | null; publishedBy: string | null;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function SettingsManager() {
  const [data, setData] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<SiteSettingsConfig>(DEFAULTS);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved">("idle");
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const res = await api<Loaded & { error?: string }>("/api/admin/settings");
    if (res.ok && res.data.live) { setData(res.data); setDraft(normalizeSettings(res.data.draft)); setErr(null); }
    else setErr(res.data.error ?? "Could not load settings.");
  }, []);
  useEffect(() => { load(); }, [load]);

  const dirty = useMemo(
    () => !!data && JSON.stringify(normalizeSettings(data.live)) !== JSON.stringify(normalizeSettings(draft)),
    [data, draft],
  );
  const problems = useMemo(() => validateSettings(draft), [draft]);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!data || !dirty) return;
    const t = setTimeout(async () => {
      setAutoState("saving");
      const res = await api("/api/admin/settings", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "saveDraft", settings: draftRef.current }),
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

  const set = (patch: Partial<SiteSettingsConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const setSocial = (k: string, v: string) => setDraft((d) => ({ ...d, social: { ...d.social, [k]: v } }));

  const publish = async () => {
    const extra = draft.maintenanceMode && !data?.live.maintenanceMode
      ? "\n\nWARNING: maintenance mode is ON. Visitors will not see the normal site."
      : "";
    if (!confirm(`Publish these settings? They appear on every page. The current values are saved to history first.${extra}`)) return;
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ error?: string }>("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", settings: draft }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not publish."); return; }
    setNote("Settings published. They appear on each page the next time it rebuilds — usually within the hour.");
    setAutoState("idle"); load();
  };

  const discard = async () => {
    if (!confirm("Throw away your unpublished changes?")) return;
    await api("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "discardDraft" }),
    });
    setNote("Draft discarded."); setAutoState("idle"); load();
  };

  const rollback = async (id: string, label: string) => {
    if (!confirm(`Load the settings from ${label}?\n\nThey come back as a DRAFT — nothing changes until you publish.`)) return;
    const res = await api<{ note?: string; error?: string }>("/api/admin/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rollback", revisionId: id }),
    });
    if (!res.ok) { setErr(res.data.error ?? "Could not load those settings."); return; }
    setNote(res.data.note ?? "Loaded as a draft."); setShowHistory(false); load();
  };

  if (err && !data) return <div className="ad__err">{err}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Site settings</h2>
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
            <b>{describeSettings(data.live)}</b>
            <span className="ovh__n">{data.publishedAt ? `Published ${when(data.publishedAt)}${data.publishedBy ? ` by ${data.publishedBy}` : ""}` : "Never published from this screen"}</span>
          </div>
          <div className="hpm__col">
            <span className="ovh__l">Your draft</span>
            <b>{describeSettings(draft)}</b>
            <span className="ovh__n">{dirty ? `Not published${data.draftSavedAt ? ` · saved ${when(data.draftSavedAt)}` : ""}` : "Identical to what is live"}</span>
          </div>
        </div>

        {problems.length > 0 && (
          <div className="ad__notice ad__notice--warn">
            <b>Worth a second look.</b> {problems.join(" ")}
            <p className="aud__foot" style={{ marginTop: 6 }}>These are warnings, not blocks — you can still publish.</p>
          </div>
        )}
        {err && <div className="ad__err" style={{ marginTop: 10 }}>{err}</div>}
        {note && !err && <div className="ad__ok" style={{ marginTop: 10 }}>{note}</div>}

        <div className="ad__actions">
          <button className="ad__btn ad__btn--primary" disabled={busy || !dirty} onClick={publish}>
            <Icon name="check" size={14} /> {busy ? "Publishing…" : "Publish settings"}
          </button>
          {dirty && <button className="ad__btn" onClick={discard}>Discard changes</button>}
        </div>
        <p className="ad__hintline">
          These appear on every page of the site, so they are not saved live as you type. Publishing clears the cached
          copy of the values; each page picks them up the next time it rebuilds — usually within the hour. Deliberate:
          rebuilding every page at once for a text change is exactly the kind of bulk work the site is tuned to avoid.
        </p>
      </section>

      {showHistory && (
        <section className="ad__panel">
          <div className="ad__panelhead"><h2>Previous settings <span className="ad__count">{data.revisions.length}</span></h2></div>
          <div className="ad__list">
            {data.revisions.map((r) => (
              <div className="ad__row" key={r.id}>
                <span className="ad__cat">saved</span>
                <span className="ad__name">{r.note ?? "Settings version"}</span>
                <span className="ad__meta">{when(r.created_at)}{r.author ? ` · ${r.author}` : ""}</span>
                <button className="ad__mini" onClick={() => rollback(r.id, when(r.created_at))}>Load as draft</button>
              </div>
            ))}
            {!data.revisions.length && <div className="ad__empty">No previous versions yet. The first publish creates one.</div>}
          </div>
        </section>
      )}

      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Search and sharing</h2></div>
        <label className="ad__field">
          <span>Site title ({draft.siteTitle.length} of 60) — the headline Google shows for the home page</span>
          <input maxLength={70} value={draft.siteTitle} onChange={(e) => set({ siteTitle: e.target.value })} />
        </label>
        <label className="ad__field">
          <span>Site description ({draft.siteDescription.length} of 160)</span>
          <textarea rows={2} maxLength={170} value={draft.siteDescription} onChange={(e) => set({ siteDescription: e.target.value })} />
        </label>
        <label className="ad__field">
          <span>Keywords (comma separated) — Google ignores these; some other services still read them</span>
          <input value={draft.metaKeywords} onChange={(e) => set({ metaKeywords: e.target.value })} />
        </label>

        <div className="ad__serp">
          <div className="ad__serpurl">cinetonight.com</div>
          <div className="ad__serpt">{draft.siteTitle.slice(0, 60) || "Site title"}</div>
          <div className="ad__serpd">{draft.siteDescription.slice(0, 160) || "Your description appears here."}</div>
        </div>
      </section>

      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Contact and social</h2></div>
        <label className="ad__field">
          <span>Contact email — shown on the site and used for replies</span>
          <input type="email" value={draft.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        </label>
        <div className="ad__grid2">
          {SOCIAL_KEYS.map((k) => (
            <label className="ad__field" key={k}>
              <span>{SOCIAL_LABEL[k]}</span>
              <input value={draft.social[k] ?? ""} placeholder="https://…"
                onChange={(e) => setSocial(k, e.target.value)} />
            </label>
          ))}
        </div>
        <p className="ad__hintline">
          A link is only used if it is a full <code>https://</code> address — anything else is ignored rather than
          rendered, so a mistyped value can never become a broken or unsafe link in the footer.
        </p>
      </section>

      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Maintenance mode</h2></div>
        <label className="ad__field" style={{ maxWidth: 320 }}>
          <span>State</span>
          <select value={draft.maintenanceMode ? "on" : "off"} onChange={(e) => set({ maintenanceMode: e.target.value === "on" })}>
            <option value="off">Off — the site is open as normal</option>
            <option value="on">On — visitors see a maintenance notice</option>
          </select>
        </label>
        {draft.maintenanceMode && (
          <div className="ad__notice ad__notice--warn">
            <b>This closes the site to visitors.</b> Only turn it on if you mean to, and remember it does not take
            effect until you press Publish.
          </div>
        )}
      </section>
    </div>
  );
}
