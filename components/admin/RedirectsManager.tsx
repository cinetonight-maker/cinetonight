"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { api } from "./shared";
import {
  REDIRECT_REASONS, REASON_LABEL, REDIRECT_STATUSES, DEFAULT_STATUS,
  isPermanent, MAX_ENABLED_RULES,
  type RedirectReason,
} from "@/lib/redirects";

/* ============================================================================
 * /admin/redirects — old address → new address, without a deploy.
 *
 * THE CONTRACT, and why it is unlike the other modules: a redirect is not one
 * document with a draft, it is a set of independent rules. So "preview before
 * publishing" is per rule — every rule is created SWITCHED OFF, you test the
 * URL, then you turn it on.
 *
 * Two things this screen refuses to let you do, both enforced server-side:
 * redirect an address that is a live page (the page would vanish), and create
 * a chain (A→B→C is stored flattened as A→C before it is ever saved).
 * ========================================================================= */

interface Rule {
  id: string; from_path: string; to_path: string; status: number;
  enabled: boolean; reason: RedirectReason; note: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
interface Health { total: number; enabled: number; cap: number; chains: { from: string; via: string; to: string }[] }
interface TestResult { path: string; verdict: "redirect" | "disabled" | "live" | "notfound" | "invalid"; to: string | null; status: number | null }
interface BulkRow { line: number; raw: string; ok: boolean; from?: string; to?: string; error?: string }

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const statusLabel = (s: number) =>
  s === 308 ? "308 permanent" : s === 301 ? "301 permanent" : s === 307 ? "307 temporary" : "302 temporary";

export default function RedirectsManager() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [onlyEnabled, setOnlyEnabled] = useState<"all" | "on" | "off">("all");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState<RedirectReason>("slug_change");
  const [ruleNote, setRuleNote] = useState("");

  const [probe, setProbe] = useState("");
  const [tested, setTested] = useState<TestResult | null>(null);

  const [showBulk, setShowBulk] = useState(false);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<BulkRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ rules?: Rule[]; health?: Health; error?: string; needsSetup?: boolean }>("/api/admin/redirects");
    if (res.ok && res.data.rules) {
      setRules(res.data.rules); setHealth(res.data.health ?? null); setErr(null); setNeedsSetup(false);
    } else {
      setErr(res.data.error ?? "Could not load redirects.");
      setNeedsSetup(res.data.needsSetup === true);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rules.filter((r) => {
      if (onlyEnabled === "on" && !r.enabled) return false;
      if (onlyEnabled === "off" && r.enabled) return false;
      return !needle || r.from_path.includes(needle) || r.to_path.includes(needle);
    });
  }, [rules, q, onlyEnabled]);

  const create = async () => {
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ error?: string; flattened?: boolean }>("/api/admin/redirects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to, reason, note: ruleNote, status: DEFAULT_STATUS }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not save that redirect."); return; }
    setNote(
      res.data.flattened
        ? "Saved, switched off. The new address already redirected somewhere else, so this rule was pointed straight at the final destination - one hop, never a chain."
        : "Saved, switched off. Test it below, then switch it on.",
    );
    setFrom(""); setTo(""); setRuleNote(""); load();
  };

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ error?: string; rewrites?: number }>("/api/admin/redirects", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not update that rule."); return; }
    setNote(`${label}.${res.data.rewrites ? ` ${res.data.rewrites} other rule(s) re-pointed to avoid a chain.` : ""}`);
    load();
  };

  const toggle = (r: Rule) => {
    if (!r.enabled && !confirm(`Switch on ${r.from_path} → ${r.to_path}?\n\nAnyone visiting the old address will be sent to the new one straight away.`)) return;
    patch(r.id, { enabled: !r.enabled }, r.enabled ? "Switched off" : "Switched on");
  };

  const promote = (r: Rule) => {
    if (!confirm(
      `Make this redirect PERMANENT?\n\n${r.from_path} → ${r.to_path}\n\n` +
      "Permanent redirects are remembered by browsers, so this is hard to take back - " +
      "a visitor who has seen it may keep being redirected even after you delete the rule.\n\n" +
      "Only do this once you are sure the new address is the right one.",
    )) return;
    patch(r.id, { status: 308 }, "Made permanent");
  };

  const remove = async (r: Rule) => {
    if (!confirm(
      `Delete ${r.from_path} → ${r.to_path}?\n\n` +
      (isPermanent(r.status)
        ? "This was a PERMANENT redirect, so browsers that already followed it may keep doing so for a while.\n\n"
        : "") +
      "Anyone visiting the old address will get a “page not found” again.",
    )) return;
    setBusy(true);
    const res = await api<{ error?: string }>(`/api/admin/redirects?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not delete that rule."); return; }
    setNote("Deleted."); load();
  };

  const test = async () => {
    const res = await api<{ test?: TestResult }>(`/api/admin/redirects?test=${encodeURIComponent(probe)}`);
    setTested(res.ok ? res.data.test ?? null : null);
  };

  const bulk = async (action: "bulkPreview" | "bulkApply") => {
    setBusy(true); setErr(null); setNote(null);
    const res = await api<{ preview?: BulkRow[]; imported?: number; error?: string }>("/api/admin/redirects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, csv, reason: "migration" }),
    });
    setBusy(false);
    if (action === "bulkPreview") { setPreview(res.data.preview ?? []); if (!res.ok) setErr(res.data.error ?? null); return; }
    if (!res.ok) { setErr(res.data.error ?? "Import failed."); return; }
    setNote(`Imported ${res.data.imported} rules, all switched off. Review them, then switch on the ones you want.`);
    setCsv(""); setPreview(null); setShowBulk(false); load();
  };

  if (needsSetup) return <div className="ad__err">{err}</div>;

  return (
    <div className="ad__body ad__body--one">
      {err && <div className="ad__err">{err}</div>}
      {note && !err && <div className="ad__ok">{note}</div>}

      {/* ---- add ---- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Add a redirect</h2>
          <button className="ad__mini" onClick={() => setShowBulk((v) => !v)}>
            {showBulk ? "Hide bulk import" : "Bulk import"}
          </button>
        </div>

        <div className="ad__grid2">
          <label className="ad__field">
            <span>Old address - the one that no longer works</span>
            <input value={from} placeholder="/blog/old-post-name" onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="ad__field">
            <span>New address - where visitors should end up</span>
            <input value={to} placeholder="/blog/new-post-name" onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <div className="ad__grid2">
          <label className="ad__field">
            <span>Why</span>
            <select value={reason} onChange={(e) => setReason(e.target.value as RedirectReason)}>
              {REDIRECT_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="ad__field">
            <span>Note (optional)</span>
            <input value={ruleNote} placeholder="Merged the weekend roundups" onChange={(e) => setRuleNote(e.target.value)} />
          </label>
        </div>

        <div className="ad__actions">
          <button className="ad__btn ad__btn--primary" disabled={busy || !from.trim() || !to.trim()} onClick={create}>
            <Icon name="plus" size={14} /> Add, switched off
          </button>
        </div>
        <p className="ad__hintline">
          Every new rule is created <b>switched off</b>, and starts as a <b>temporary</b> redirect. Test it below, switch
          it on, and only make it permanent once you are sure - browsers remember permanent redirects, which makes a
          mistake hard to take back. Only addresses on this site are allowed.
        </p>

        {showBulk && (
          <div className="ad__notice" style={{ marginTop: 12 }}>
            <b>Bulk import</b>
            <p className="aud__foot" style={{ marginTop: 4 }}>
              One rule per line: <code>old,new</code> - optionally <code>old,new,308</code>. Preview first; nothing is
              written until you press Import, and everything arrives switched off.
            </p>
            <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)}
              placeholder={"/old-page,/new-page\n/blog/old,/blog/new,308"} style={{ width: "100%", marginTop: 8 }} />
            <div className="ad__actions">
              <button className="ad__mini" disabled={busy || !csv.trim()} onClick={() => bulk("bulkPreview")}>Preview</button>
              <button className="ad__btn ad__btn--primary" disabled={busy || !preview?.some((r) => r.ok)} onClick={() => bulk("bulkApply")}>
                Import {preview ? preview.filter((r) => r.ok).length : 0} valid rules
              </button>
            </div>
            {preview && (
              <div className="ad__list" style={{ marginTop: 10 }}>
                {preview.map((r) => (
                  <div className="ad__row" key={r.line}>
                    <span className={`ad__cat${r.ok ? "" : " ad__cat--bad"}`}>{r.ok ? "ok" : "skip"}</span>
                    <span className="ad__name">{r.ok ? `${r.from} → ${r.to}` : r.raw}</span>
                    {!r.ok && <span className="ad__meta">{r.error}</span>}
                  </div>
                ))}
                {!preview.length && <div className="ad__empty">Nothing to import.</div>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---- URL tester ---- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Test an address</h2></div>
        <div className="ad__filters">
          <input className="ad__search" style={{ flex: 1 }} value={probe} placeholder="/blog/some-old-post"
            onChange={(e) => { setProbe(e.target.value); setTested(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") test(); }} />
          <button className="ad__mini" disabled={!probe.trim()} onClick={test}>Check</button>
        </div>
        {tested && (
          <div className={`ad__notice${tested.verdict === "redirect" ? "" : " ad__notice--warn"}`} style={{ marginTop: 10 }}>
            {tested.verdict === "redirect" && <><b>Redirects.</b> {tested.path} → {tested.to} ({statusLabel(tested.status!)})</>}
            {tested.verdict === "disabled" && <><b>Rule exists but is switched off.</b> {tested.path} still shows “page not found”. It would go to {tested.to} once switched on.</>}
            {tested.verdict === "live" && <><b>That is a live page.</b> It loads normally, and a redirect for it would be refused - the page would disappear.</>}
            {tested.verdict === "notfound" && <><b>No rule.</b> {tested.path} shows “page not found”.</>}
            {tested.verdict === "invalid" && <><b>Not a valid address.</b> It has to start with “/” and be on this site.</>}
          </div>
        )}
        <p className="ad__hintline">
          This runs the same lookup a real visitor's request runs, so it cannot disagree with what actually happens.
        </p>
      </section>

      {/* ---- rules ---- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Redirects <span className="ad__count">{rules.length}</span></h2>
          {health && (
            <span className="ad__meta">
              {health.enabled} of {health.cap} switched on
              {health.chains.length > 0 && <b className="ad__meta--warn"> · {health.chains.length} chain(s) found</b>}
            </span>
          )}
        </div>

        <div className="ad__filters">
          {(["all", "on", "off"] as const).map((f) => (
            <button key={f} type="button" className={`ad__chip${onlyEnabled === f ? " on" : ""}`} onClick={() => setOnlyEnabled(f)}>
              {f === "all" ? "All" : f === "on" ? "Switched on" : "Switched off"}
              <em>{f === "all" ? rules.length : rules.filter((r) => (f === "on" ? r.enabled : !r.enabled)).length}</em>
            </button>
          ))}
          <input className="ad__search" value={q} placeholder="Search addresses…" onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="ad__list">
          {visible.map((r) => (
            <div className="ad__row" key={r.id}>
              <span className={`ad__cat${r.enabled ? "" : " ad__cat--bad"}`}>{r.enabled ? "on" : "off"}</span>
              <span className="ad__name" title={`${r.from_path} → ${r.to_path}`}>
                {r.from_path} <span style={{ opacity: 0.6 }}>→</span> {r.to_path}
              </span>
              <span className="ad__meta">
                {statusLabel(r.status)} · {REASON_LABEL[r.reason] ?? r.reason} · {when(r.updated_at)}
                {r.note ? ` · ${r.note}` : ""}
              </span>
              <button className="ad__mini" disabled={busy} onClick={() => toggle(r)}>{r.enabled ? "Switch off" : "Switch on"}</button>
              {r.enabled && !isPermanent(r.status) && (
                <button className="ad__mini" disabled={busy} onClick={() => promote(r)}>Make permanent</button>
              )}
              <button className="ad__mini ad__mini--x" disabled={busy} onClick={() => remove(r)}>✕</button>
            </div>
          ))}
          {!visible.length && (
            <div className="ad__empty">
              {rules.length ? "Nothing matches that." : "No redirects yet. Rename a post or page and one will be offered automatically."}
            </div>
          )}
        </div>

        <p className="ad__hintline">
          A redirect only does anything for an address that would otherwise show “page not found”, so these rules cost
          nothing on pages that work. Up to {MAX_ENABLED_RULES} can be switched on at once - the whole set is loaded as a
          single cached lookup, which is what keeps it free.
          {" "}Chains are removed when a rule is saved: if the new address already redirects somewhere else, the rule is
          pointed straight at the final destination.
        </p>
      </section>
    </div>
  );
}
