"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { api } from "./shared";
import { changedFields } from "@/lib/auditSummary";
import {
  buildActivityQuery, describeFilters, DATE_PRESETS,
  type DatePreset, type ActivityQuery,
} from "@/lib/activityFilters";

/* ============================================================================
 * /admin/activity — who changed what, and when.
 *
 * Every publish, delete, restore and settings change writes one row here.
 * Autosave and draft-discard deliberately do not: they are invisible to the
 * public, happen every twenty seconds while typing, and would bury the entries
 * that matter.
 *
 * This screen is READ ONLY. There is no edit and no delete, because a log an
 * admin can quietly rewrite is not a log.
 * ========================================================================= */

interface Entry {
  id: string;
  actor: string | null;
  module: string;
  action: string;
  target_id: string | null;
  target_label: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

const MODULE_LABEL: Record<string, string> = {
  blog: "Blog Posts", pages: "Pages", homepage: "Homepage", discovery: "Discovery",
  catalogue: "Movies & Series", "free-movies": "Free Movies", media: "Media Library",
  navigation: "Navigation", comments: "Comments", settings: "Settings", sync: "Sync Center",
};

/** Plain-English verb + the colour that matches how serious it is. */
const ACTION: Record<string, { label: string; tone: string }> = {
  create:     { label: "Created",       tone: "blue" },
  publish:    { label: "Published",     tone: "green" },
  update:     { label: "Updated",       tone: "violet" },
  schedule:   { label: "Scheduled",     tone: "violet" },
  unpublish:  { label: "Unpublished",   tone: "amber" },
  trash:      { label: "Moved to Trash", tone: "amber" },
  restore:    { label: "Restored",      tone: "teal" },
  rollback:   { label: "Rolled back",   tone: "teal" },
  delete:     { label: "Deleted",       tone: "pink" },
  settings:   { label: "Settings changed", tone: "violet" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

const val = (v: unknown) =>
  v === null || v === undefined || v === "" ? "-"
  : typeof v === "string" ? v
  : JSON.stringify(v);

export default function ActivityLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  /* ---- filters. All optional, all combinable, all applied server-side. ---- */
  const [moduleFilter, setModuleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  /* Typing shouldn't fire a query per keystroke. */
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* The admins and actions that actually appear in the log, so the dropdowns
     offer real options rather than a hard-coded guess (CMS Rule 6). */
  const [facets, setFacets] = useState<{ actors: string[]; actions: string[]; modules: string[] }>({
    actors: [], actions: [], modules: [],
  });
  useEffect(() => {
    api<{ actors?: string[]; actions?: string[]; modules?: string[] }>("/api/admin/activity?facets=1")
      .then((r) => {
        if (!r.ok) return;
        setFacets({
          actors: r.data.actors ?? [], actions: r.data.actions ?? [], modules: r.data.modules ?? [],
        });
      })
      .catch(() => {});
  }, []);

  const filters: ActivityQuery = {
    module: moduleFilter || undefined,
    action: actionFilter || undefined,
    actor: actorFilter || undefined,
    preset,
    customFrom: customFrom || undefined,
    customTo: customTo || undefined,
    search: debounced || undefined,
  };
  const anyFilter =
    !!moduleFilter || !!actionFilter || !!actorFilter || preset !== "all" || !!debounced;

  const clearFilters = () => {
    setModuleFilter(""); setActionFilter(""); setActorFilter("");
    setPreset("all"); setCustomFrom(""); setCustomTo("");
    setSearch(""); setDebounced("");
  };

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    // buildActivityQuery drops anything that is not a known module/action and
    // escapes the search term — see lib/activityFilters.ts.
    const qs = buildActivityQuery({ ...filters, before }, new Date());
    const res = await api<{ entries?: Entry[]; hasMore?: boolean; unsupported?: boolean; error?: string }>(
      `/api/admin/activity${qs ? `?${qs}` : ""}`,
    );
    if (res.ok) {
      setUnsupported(!!res.data.unsupported);
      setEntries((prev) => (before ? [...prev, ...(res.data.entries ?? [])] : res.data.entries ?? []));
      setHasMore(!!res.data.hasMore);
      setErr(null);
    } else setErr(res.data.error ?? "Could not load the activity log.");
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleFilter, actionFilter, actorFilter, preset, customFrom, customTo, debounced]);

  useEffect(() => { load(); }, [load]);

  if (err) return <div className="ad__err">{err}</div>;

  const modules = ["", ...Object.keys(MODULE_LABEL)];

  return (
    <div className="ad__body ad__body--one">
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Activity <span className="ad__count">{entries.length}{hasMore ? "+" : ""}</span></h2>
          <button className="ad__mini" onClick={() => load()}>Refresh</button>
        </div>
        <p className="ad__hintline">
          Every publish, delete, restore and settings change, newest first. Autosaves are not listed -
          they never reach the public site. This log cannot be edited or deleted from the dashboard.
        </p>

        <div className="ad__filters">
          {modules.map((m) => (
            <button key={m || "all"} type="button"
              className={`ad__chip${moduleFilter === m ? " on" : ""}`}
              onClick={() => setModuleFilter(m)}>
              {m ? MODULE_LABEL[m] : "Everything"}
            </button>
          ))}
        </div>

        <div className="aud__filters">
          <label className="ad__field aud__f">
            <span>Action</span>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Any action</option>
              {(facets.actions.length ? facets.actions : Object.keys(ACTION)).map((a) => (
                <option key={a} value={a}>{ACTION[a]?.label ?? a}</option>
              ))}
            </select>
          </label>

          <label className="ad__field aud__f">
            <span>Admin</span>
            <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="">Anyone</option>
              {facets.actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>

          <label className="ad__field aud__f">
            <span>When</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as DatePreset)}>
              {DATE_PRESETS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>

          {preset === "custom" && (
            <>
              <label className="ad__field aud__f">
                <span>From</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label className="ad__field aud__f">
                <span>To</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </label>
            </>
          )}

          <label className="ad__field aud__f aud__f--grow">
            <span>Search the item name or note</span>
            <input value={search} placeholder="e.g. reacher, about-us, address changed"
              onChange={(e) => setSearch(e.target.value)} />
          </label>
        </div>

        <div className="aud__applied">
          <span>Showing <b>{describeFilters(filters)}</b></span>
          {anyFilter && <button type="button" className="ad__mini" onClick={clearFilters}>Clear filters</button>}
        </div>

        {unsupported && (
          <div className="ad__notice">
            The activity log is not switched on yet. Run <code>supabase/audit_log.sql</code> in
            Supabase → SQL Editor, and everything from that moment on will be recorded here.
            Nothing else in the dashboard is affected.
          </div>
        )}

        {loading && !entries.length ? <div className="empty">Loading…</div> : (
          <div className="ad__list">
            {entries.map((e) => {
              const a = ACTION[e.action] ?? { label: e.action, tone: "violet" };
              const isOpen = open === e.id;
              const diff = isOpen ? changedFields(e.before, e.after) : [];
              return (
                <div key={e.id}>
                  <div className="ad__row">
                    <span className={`ovs__ico ovs__ico--${a.tone} aud__ico`}><Icon name="check" size={13} /></span>
                    <span className="ad__cat">{a.label}</span>
                    <span className="ad__name">{e.target_label ?? "(untitled)"}</span>
                    <span className="ad__meta aud__meta">
                      {MODULE_LABEL[e.module] ?? e.module} · {e.actor ?? "unknown user"} · {when(e.created_at)}
                    </span>
                    <button className="ad__mini" onClick={() => setOpen(isOpen ? null : e.id)}>
                      {isOpen ? "Hide" : "Details"}
                    </button>
                    <Link className="ad__mini" href={`/admin/activity/${e.id}`} title="Open this entry on its own page">Open</Link>
                  </div>
                  {isOpen && (
                    <div className="aud__detail">
                      {e.note && <p className="aud__note">{e.note}</p>}
                      {diff.length === 0 ? (
                        <p className="ov__empty">No field-level differences were recorded for this action.</p>
                      ) : (
                        <table className="aud__table">
                          <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                          <tbody>
                            {diff.map((c) => (
                              <tr key={c.field}>
                                <td><b>{c.field}</b></td>
                                <td>{val(c.from)}</td>
                                <td>{val(c.to)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <p className="aud__foot">
                        Long text is recorded as a size and fingerprint rather than a second copy -
                        the full version is in that item&rsquo;s History, which is what a rollback reads.
                        {" "}<Link href={`/admin/activity/${e.id}`}>Open the full entry</Link> to see every field and
                        whether this change can be undone.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {!entries.length && !unsupported && (
              <div className="ad__empty">
                {anyFilter
                  ? "Nothing matches these filters. Try widening the date range or clearing them."
                  : "Nothing recorded yet. Publish or change something and it will appear here."}
              </div>
            )}
          </div>
        )}

        {hasMore && (
          <div className="ad__actions" style={{ marginTop: 12 }}>
            <button className="ad__btn" disabled={loading}
              onClick={() => load(entries[entries.length - 1]?.created_at)}>
              {loading ? "Loading…" : "Load older"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
