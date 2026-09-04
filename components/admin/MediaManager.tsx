"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { api, uploadMedia } from "./shared";

/* ============================================================================
 * /admin/media — the image library, with the two things the old screen was
 * missing: how much space it uses, and which files nothing points at.
 *
 * WHY THIS EXISTS: storage is the bill that already bit once. Knowing which
 * uploads are dead weight is the only way to keep it under control without
 * guessing — and guessing, here, means deleting an image a live page is
 * showing.
 *
 * SAFETY: "unused" is decided by scanning every place an image URL can end up
 * (see the API), and matching on the file name rather than the whole URL, so
 * the same file referenced through a slightly different URL still counts as
 * used. The report errs toward keeping files. Deleting still confirms, one
 * file at a time or as an explicit batch, and every delete is logged.
 * ========================================================================= */

interface Item {
  id: string; name: string; url: string; size: number | null;
  mime_type: string | null; created_at: string;
  usedIn: string[]; used: boolean;
}
interface Totals { files: number; bytes: number; unusedFiles: number; unusedBytes: number; scanned: number }

const size = (b: number | null) =>
  b == null ? "-"
  : b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`;

type Filter = "all" | "unused" | "used";

export default function MediaManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ items?: Item[]; totals?: Totals; error?: string }>("/api/admin/media/usage");
    if (res.ok && res.data.items) { setItems(res.data.items); setTotals(res.data.totals ?? null); setErr(null); }
    else setErr(res.data.error ?? "Could not load the media library.");
    setSelected(new Set());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "unused" && i.used) return false;
      if (filter === "used" && !i.used) return false;
      return !needle || i.name.toLowerCase().includes(needle);
    });
  }, [items, filter, q]);

  const upload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true); setErr(null); setNote(null);
    const res = await uploadMedia(file);
    setBusy(false);
    if ("error" in res) setErr(res.error);
    else { setNote(`Uploaded ${file.name}.`); load(); }
  };

  const remove = async (item: Item) => {
    const warning = item.used
      ? `“${item.name}” is USED in: ${item.usedIn.join(", ")}.\n\nDeleting it will leave a broken image on those pages. Delete anyway?`
      : `Delete “${item.name}” permanently? Nothing on the site points at it, and this cannot be undone.`;
    if (!confirm(warning)) return;
    setBusy(true);
    const res = await api<{ error?: string }>(`/api/admin/media?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setErr(res.data.error ?? "Could not delete that file."); return; }
    setNote(`Deleted ${item.name}.`); load();
  };

  const removeSelected = async () => {
    const chosen = items.filter((i) => selected.has(i.id));
    if (!chosen.length) return;
    const usedCount = chosen.filter((i) => i.used).length;
    const bytes = chosen.reduce((s, i) => s + (i.size ?? 0), 0);
    const warning =
      `Delete ${chosen.length} file${chosen.length === 1 ? "" : "s"} permanently (${size(bytes)})?\n\n` +
      (usedCount
        ? `${usedCount} of them ${usedCount === 1 ? "is" : "are"} STILL USED on the site - those pages will show a broken image.\n\n`
        : "None of them are used anywhere on the site.\n\n") +
      "This cannot be undone.";
    if (!confirm(warning)) return;

    setBusy(true); setErr(null);
    let done = 0, failed = 0;
    for (const item of chosen) {
      const res = await api(`/api/admin/media?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      res.ok ? done++ : failed++;
    }
    setBusy(false);
    setNote(`Deleted ${done} file${done === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
    load();
  };

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAllUnused = () => setSelected(new Set(items.filter((i) => !i.used).map((i) => i.id)));

  return (
    <div className="ad__body ad__body--one">
      {err && <div className="ad__err">{err}</div>}
      {note && !err && <div className="ad__ok">{note}</div>}

      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Media library <span className="ad__count">{totals?.files ?? items.length}</span></h2>
          <label className="ad__btn ad__btn--primary" style={{ cursor: "pointer" }}>
            <Icon name="plus" size={14} /> {busy ? "Working…" : "Upload image"}
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(e.target.files)} />
          </label>
        </div>

        {totals && (
          <div className="ovh" style={{ marginBottom: 14 }}>
            <Cell icon="tv" tone="teal" label="Files" value={String(totals.files)} note="In the library" />
            <Cell icon="grid" tone="violet" label="Space used" value={size(totals.bytes)} note="Supabase storage" />
            <Cell icon="x" tone={totals.unusedFiles ? "amber" : "green"} label="Unused"
              value={String(totals.unusedFiles)} note={totals.unusedFiles ? `${size(totals.unusedBytes)} recoverable` : "Nothing wasted"} />
            <Cell icon="check" tone="blue" label="Places checked" value={String(totals.scanned)} note="Posts, pages, catalogue, config" />
          </div>
        )}

        <div className="ad__filters">
          {(["all", "unused", "used"] as Filter[]).map((f) => (
            <button key={f} type="button" className={`ad__chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "unused" ? "Not used anywhere" : "In use"}
              <em>{f === "all" ? items.length : items.filter((i) => (f === "unused" ? !i.used : i.used)).length}</em>
            </button>
          ))}
          <input className="ad__search" value={q} placeholder="Search file names…" onChange={(e) => setQ(e.target.value)} />
        </div>

        {selected.size > 0 && (
          <div className="ad__notice ad__notice--warn">
            <div><b>{selected.size} selected.</b> Deleting is permanent and cannot be undone.</div>
            <div className="ad__actions">
              <button className="ad__mini ad__mini--x" disabled={busy} onClick={removeSelected}>Delete selected</button>
              <button className="ad__mini" onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          </div>
        )}

        {filter === "unused" && visible.length > 0 && selected.size === 0 && (
          <div className="ad__actions" style={{ marginBottom: 10 }}>
            <button className="ad__mini" onClick={selectAllUnused}>Select all unused ({items.filter((i) => !i.used).length})</button>
          </div>
        )}

        {loading ? <div className="empty">Checking every page for image usage…</div> : (
          <div className="ad__list">
            {visible.map((i) => (
              <div className="ad__row" key={i.id}>
                <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.name}`} />
                <img className="ad__thumb" alt="" src={i.url} style={{ width: 46, height: 32, objectFit: "cover" }} />
                <span className={`ad__cat${i.used ? "" : " ad__cat--bad"}`}>{i.used ? "in use" : "unused"}</span>
                <span className="ad__name" title={i.name}>{i.name}</span>
                <span className="ad__meta">
                  {size(i.size)}
                  {i.used && ` · ${i.usedIn.join(", ")}`}
                </span>
                <a className="ad__mini" href={i.url} target="_blank" rel="noreferrer">Open</a>
                <button className="ad__mini ad__mini--x" disabled={busy} onClick={() => remove(i)}>✕</button>
              </div>
            ))}
            {!visible.length && (
              <div className="ad__empty">
                {filter === "unused" ? "Every file is used somewhere. Nothing to clean up." : q ? "No file names match that." : "Nothing uploaded yet."}
              </div>
            )}
          </div>
        )}

        <p className="ad__hintline">
          &ldquo;Unused&rdquo; means the file name appears nowhere in your posts, pages, catalogue artwork or homepage
          and discovery settings. Matching is on the file name rather than the full address, so an image referenced
          through a slightly different URL still counts as used - this report would rather keep a file than tell you it
          is safe to delete something a page is still showing.
        </p>
      </section>
    </div>
  );
}

function Cell({ icon, tone, label, value, note }: { icon: string; tone: string; label: string; value: string; note: string }) {
  return (
    <div className="ovh__c">
      <span className={`ovh__ico ovs__ico--${tone}`}><Icon name={icon} size={16} /></span>
      <span className="ovh__body">
        <span className="ovh__l">{label}</span>
        <span className="ovh__v">{value}</span>
        <span className="ovh__n">{note}</span>
      </span>
    </div>
  );
}
