"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { api } from "./shared";
import { changedFields } from "@/lib/auditSummary";

/* ============================================================================
 * /admin/activity/<id> — one audit entry in full.
 *
 * READ ONLY. It shows what happened and whether it CAN be undone; it does not
 * undo anything itself. Rolling back is done from the item's own History,
 * where it belongs — a rollback is a content change, and content changes are
 * logged, so triggering one from inside the log would be circular.
 * ========================================================================= */

interface Entry {
  id: string; actor: string | null; module: string; action: string;
  target_id: string | null; target_label: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  note: string | null; created_at: string;
}
interface Rollback {
  supported: boolean; available: boolean; reason: string;
  editorHref: string | null; revisionCount: number; itemExists: boolean;
}

const MODULE_LABEL: Record<string, string> = {
  blog: "Blog Posts", pages: "Pages", homepage: "Homepage", discovery: "Discovery",
  catalogue: "Movies & Series", "free-movies": "Free Movies", media: "Media Library",
  navigation: "Navigation", comments: "Comments", settings: "Settings", sync: "Sync Center",
};
const ACTION: Record<string, { label: string; tone: string }> = {
  create: { label: "Created", tone: "blue" }, publish: { label: "Published", tone: "green" },
  update: { label: "Updated", tone: "violet" }, schedule: { label: "Scheduled", tone: "violet" },
  unpublish: { label: "Unpublished", tone: "amber" }, trash: { label: "Moved to Trash", tone: "amber" },
  restore: { label: "Restored", tone: "teal" }, rollback: { label: "Rolled back", tone: "teal" },
  delete: { label: "Deleted", tone: "pink" }, settings: { label: "Settings changed", tone: "violet" },
};

const val = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "string" ? v : JSON.stringify(v);

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(Math.abs(diff) / 60000);
  const rel = m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  return rel === "just now" ? rel : `${rel} ago`;
}

export default function ActivityDetail({ id }: { id: string }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [rollback, setRollback] = useState<Rollback | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<{ entry?: Entry; rollback?: Rollback; error?: string }>(`/api/admin/activity/${encodeURIComponent(id)}`)
      .then((r) => {
        if (r.ok && r.data.entry) { setEntry(r.data.entry); setRollback(r.data.rollback ?? null); }
        else setErr(r.data.error ?? "Could not load that entry.");
      })
      .catch(() => setErr("Could not reach the server."));
  }, [id]);

  if (err) {
    return (
      <div className="ad__body ad__body--one">
        <div className="ad__err">{err}</div>
        <div className="ad__actions"><Link className="ad__btn" href="/admin/activity">Back to Activity</Link></div>
      </div>
    );
  }
  if (!entry) return <div className="empty">Loading…</div>;

  const a = ACTION[entry.action] ?? { label: entry.action, tone: "violet" };
  const changed = changedFields(entry.before, entry.after);
  const allKeys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])]
    .filter((k) => k !== "…")
    .sort();
  const rows = showAll
    ? allKeys.map((k) => ({ field: k, from: entry.before?.[k] ?? null, to: entry.after?.[k] ?? null }))
    : changed;

  return (
    <div className="ad__body ad__body--one">
      <div className="ad__actions" style={{ marginBottom: 4 }}>
        <Link className="ad__mini" href="/admin/activity"><Icon name="chevl" size={13} /> Back to Activity</Link>
      </div>

      {/* ------------------------------ header ------------------------------ */}
      <section className="ad__panel">
        <div className="audd__head">
          <span className={`ovs__ico ovs__ico--${a.tone} audd__ico`}><Icon name="check" size={18} /></span>
          <div className="audd__headtxt">
            <h2 className="audd__title">{a.label} — {entry.target_label ?? "(untitled)"}</h2>
            <p className="audd__sub">{entry.note ?? "No further detail was recorded."}</p>
          </div>
        </div>

        <div className="audd__facts">
          <Fact label="Admin" value={entry.actor ?? "unknown"} hint={entry.actor ? "Read from their signed-in session" : "The session could not be read at the time"} />
          <Fact label="Module" value={MODULE_LABEL[entry.module] ?? entry.module} hint={entry.module} />
          <Fact label="Action" value={a.label} hint={entry.action} />
          <Fact
            label="Time"
            value={new Date(entry.created_at).toLocaleString("en-GB", {
              day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
            })}
            hint={ago(entry.created_at)}
          />
          <Fact label="Item" value={entry.target_label ?? "—"} hint={entry.target_id ?? "no id recorded"} />
          <Fact label="Entry" value={entry.id.slice(0, 8)} hint="Audit entry id" />
        </div>
      </section>

      {/* ---------------------------- rollback ----------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Can this be undone?</h2></div>
        {rollback ? (
          <div className={`ad__notice${rollback.available ? "" : " ad__notice--warn"}`}>
            <div>
              <b>{rollback.available ? "Yes — a saved version exists." : "No."}</b> {rollback.reason}
            </div>
            {rollback.available && rollback.editorHref && (
              <>
                <div className="ad__actions">
                  <Link className="ad__mini" href={rollback.editorHref}>Open {MODULE_LABEL[entry.module] ?? entry.module}</Link>
                </div>
                <p className="aud__foot" style={{ marginTop: 8 }}>
                  Open the item and use <b>History</b> to restore a version. Rolling back is done there, not here:
                  this screen is a record, and a record you can act on is a record you can rewrite.
                </p>
              </>
            )}
          </div>
        ) : <div className="empty">Checking…</div>}
      </section>

      {/* --------------------------- before / after ------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>What changed <span className="ad__count">{changed.length}</span></h2>
          {allKeys.length > changed.length && (
            <button className="ad__mini" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Only what changed" : `Show all ${allKeys.length} fields`}
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="ov__empty">No field-level differences were recorded for this action.</p>
        ) : (
          <table className="aud__table audd__table">
            <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const isChanged = changed.some((x) => x.field === c.field);
                return (
                  <tr key={c.field} className={isChanged ? "audd__changed" : undefined}>
                    <td><b>{c.field}</b></td>
                    <td>{val(c.from)}</td>
                    <td>{val(c.to)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <p className="aud__foot">
          Long text is recorded as a size and a fingerprint (<code>&lt;5,000 chars · 4dda656d&gt;</code>) rather than a
          second copy — the fingerprint changes whenever the text does, so an edit that kept the same length is still
          visible here. The full version lives in that item&rsquo;s History, which is what a rollback reads.
        </p>
      </section>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="audd__fact">
      <span className="ovh__l">{label}</span>
      <span className="audd__factv">{value}</span>
      {hint && <span className="ovh__n">{hint}</span>}
    </div>
  );
}
