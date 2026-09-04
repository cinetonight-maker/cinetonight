"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { api } from "./shared";

/* ============================================================================
 * /admin/health — is everything running, and what setup is still owed?
 *
 * Read-only. Every figure is measured, never estimated. Where a number lives
 * in the Cloudflare dashboard — R2 object counts, Class A operations, request
 * volume — this screen says so and links there, rather than embedding a
 * Cloudflare API token purely to draw a chart.
 * ========================================================================= */

interface Health {
  checkedAt: string;
  services: {
    database: { ok: boolean; detail: string };
    tmdb: { ok: boolean | null; ms: number | null };
    lastSync: { at: string | null; ok: boolean | null };
    build: string | null;
  };
  counts: Record<string, number | null>;
  storage: { files: number; bytes: number; largest: { name: string; size: number } | null } | null;
  broken: { kind: string; title: string; where: string }[];
  brokenTotal: number;
  setup: { id: string; label: string; file: string; done: boolean; unlocks: string }[];
  instantPublish: { purgeConfigured: boolean; siteUrl: string | null };
}

const mb = (bytes: number) =>
  bytes >= 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(2)} GB`
  : bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB`
  : `${Math.round(bytes / 1024)} KB`;

const when = (iso: string | null) => {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function HealthScreen() {
  const [d, setD] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pruning, setPruning] = useState(false);
  const [pruneNote, setPruneNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<Health & { error?: string }>("/api/admin/health");
    if (res.ok && res.data.services) { setD(res.data); setErr(null); }
    else setErr(res.data.error ?? "Could not read the system status.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="ad__err">{err}</div>;
  if (!d) return <div className="empty">Checking…</div>;

  const pending = d.setup.filter((s) => !s.done);
  const healthy = d.services.database.ok && d.services.tmdb.ok !== false;

  return (
    <div className="ad__body ad__body--one">
      {/* ------------------------- setup checklist ------------------------ */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Setup {pending.length > 0 && <span className="ad__count">{pending.length} left</span>}</h2>
          <button className="ad__mini" onClick={load} disabled={loading}>{loading ? "Checking…" : "Re-check"}</button>
        </div>
        <p className="ad__hintline">
          Each of these is one file to paste into Supabase → SQL Editor. They only add columns and tables - they change
          no existing data and are safe to run twice. Until one is run, the dashboard hides that feature and says so;
          nothing on the live site is affected either way.
        </p>
        <div className="ad__list">
          {d.setup.map((s) => (
            <div className="ad__row" key={s.id}>
              <span className={`ad__cat${s.done ? "" : " ad__cat--bad"}`}>{s.done ? "done" : "to run"}</span>
              <span className="ad__name">{s.label}</span>
              <span className="ad__meta"><code>{s.file}</code> · {s.unlocks}</span>
            </div>
          ))}
        </div>
        {pending.length === 0 && (
          <div className="ad__ok" style={{ marginTop: 10 }}>
            <Icon name="check" size={14} /> Every database update has been run.
          </div>
        )}
      </section>

      {/* --------------------------- services ----------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Services</h2>
          <span className={`ov__more ${healthy ? "ok" : "warn"}`}>{healthy ? "All responding" : "Something needs a look"}</span>
        </div>
        <div className="ovh">
          <Cell icon="grid" tone="blue" label="Database"
            value={d.services.database.ok ? "Connected" : "Unreachable"} good={d.services.database.ok}
            note={d.services.database.detail} />
          <Cell icon="film" tone="green" label="TMDB API"
            value={d.services.tmdb.ok === null ? "Not configured" : d.services.tmdb.ok ? "Responding" : "No answer"}
            good={d.services.tmdb.ok}
            note={d.services.tmdb.ms !== null ? `${d.services.tmdb.ms} ms` : "No key set"} />
          <Cell icon="trend" tone="violet" label="Last sync"
            value={when(d.services.lastSync.at)} good={d.services.lastSync.ok}
            note={d.services.lastSync.at ? new Date(d.services.lastSync.at).toLocaleString("en-GB") : "Never run"} />
          <Cell icon="check" tone="pink" label="Build"
            value={d.services.build ? d.services.build.slice(0, 8) : "-"} good={null}
            note={d.services.build ? "Running version" : "Local - comes from Cloudflare"} />
          <Cell icon="cal" tone="teal" label="Activity entries"
            value={d.counts.auditEntries === null ? "-" : d.counts.auditEntries.toLocaleString()} good={null}
            note="Recorded changes" />
          <Cell icon="reply" tone="amber" label="Comments waiting"
            value={d.counts.comments === null ? "-" : String(d.counts.comments)}
            good={(d.counts.comments ?? 0) === 0}
            note={(d.counts.comments ?? 0) === 0 ? "Nothing to review" : "Needs review"} />
        </div>
      </section>

      {/* --------------------- instant publishing ------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>How fast a publish goes live</h2></div>
        <div className={`ad__notice${d.instantPublish.purgeConfigured ? "" : " ad__notice--warn"}`}>
          <div>
            {d.instantPublish.purgeConfigured
              ? <><b>Instant.</b> A publish clears the cached copy of exactly the affected pages straight away.</>
              : <><b>Not instant yet.</b> Publishing saves immediately and refreshes the pages, but the copy held at
                  Cloudflare&rsquo;s edge expires on its own schedule - up to an hour on blog pages. Preview always
                  shows the true current version.</>}
          </div>
          {!d.instantPublish.purgeConfigured && (
            <p className="aud__foot" style={{ marginTop: 8 }}>
              To make it instant: create a Cloudflare API token scoped to <b>Zone → Cache Purge → Purge</b> on
              cinetonight.com only, and set <code>CACHE_PURGE_ZONE_ID</code> and <code>CACHE_PURGE_API_TOKEN</code> as
              Worker secrets. Also create the D1 database named in <code>wrangler.jsonc</code>. Neither is required for
              the site to work.
            </p>
          )}
        </div>
      </section>

      {/* ---------------------------- storage ----------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Storage</h2>
          <Link className="ov__more" href="/admin/media">Manage media</Link>
        </div>
        {d.storage ? (
          <div className="ovh">
            <Cell icon="tv" tone="teal" label="Media library" value={`${d.storage.files} files`} good={null} note={mb(d.storage.bytes)} />
            <Cell icon="film" tone="violet" label="Largest file"
              value={d.storage.largest ? mb(d.storage.largest.size) : "-"} good={null}
              note={d.storage.largest?.name ?? "No files yet"} />
            <Cell icon="article" tone="blue" label="Posts" value={String(d.counts.posts ?? "-")} good={null} note="Including drafts" />
            <Cell icon="grid" tone="green" label="Catalogue" value={String(d.counts.movies ?? "-")} good={null} note="Titles" />
          </div>
        ) : <p className="ov__empty">Could not read the media library.</p>}
        <div className="ad__notice" style={{ marginTop: 12 }}>
          <b>History cleanup</b>
          <p className="aud__foot" style={{ marginTop: 4 }}>
            The database is 500 MB on the free plan, and three things grow forever: the activity log, and the version
            history behind posts and pages. Each saved version holds a full copy of the article, so a heavily-edited
            post adds up fast.
            {" "}Cleanup keeps <b>the 20 newest versions of every post and page</b>, everything from the last 90 days,
            and <b>180 days of activity log</b>. Your posts, pages, images and settings are never touched - only old
            history. It runs weekly by itself where the database supports it; this button is for the rest of the time.
          </p>
          <div className="ad__actions">
            <button className="ad__mini" disabled={pruning} onClick={async () => {
              if (!confirm("Remove history older than the retention window?\n\nPosts, pages, images and settings are not affected - only old saved versions and old activity-log entries.")) return;
              setPruning(true); setPruneNote(null);
              const res = await api<{ removed?: number; error?: string }>("/api/admin/health", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "prune" }),
              });
              setPruning(false);
              setPruneNote(res.ok
                ? `Cleanup done - ${res.data.removed ?? 0} old history rows removed.`
                : res.data.error ?? "Cleanup failed.");
              load();
            }}>{pruning ? "Cleaning…" : "Run cleanup now"}</button>
            {pruneNote && <span className="ad__meta">{pruneNote}</span>}
          </div>
        </div>

        <p className="ad__hintline">
          This is the media library - the images you upload. <b>R2 usage, request counts and cache
          operations are not shown here</b>: they live in the Cloudflare dashboard, and reading them would mean storing
          a Cloudflare API token in the site purely to draw a number. Check them at{" "}
          <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">dash.cloudflare.com</a> → R2 and Workers.
        </p>
      </section>

      {/* ------------------------- broken content ------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Content that would look wrong <span className="ad__count">{d.brokenTotal}</span></h2>
          <Link className="ov__more" href="/admin/links">Check links too</Link>
        </div>
        {d.broken.length === 0 ? (
          <div className="ad__ok"><Icon name="check" size={14} /> Every live post has an image and a description, and no published page is empty.</div>
        ) : (
          <div className="ad__list">
            {d.broken.map((b, i) => (
              <div className="ad__row" key={`${b.title}-${i}`}>
                <span className="ad__cat ad__cat--bad">{b.kind}</span>
                <span className="ad__name">{b.title}</span>
                <span className="ad__meta">{b.where}</span>
              </div>
            ))}
            {d.brokenTotal > d.broken.length && <div className="ad__empty">+ {d.brokenTotal - d.broken.length} more</div>}
          </div>
        )}
      </section>

      <p className="ad__hintline">Checked {new Date(d.checkedAt).toLocaleString("en-GB")}.</p>
    </div>
  );
}

function Cell({ icon, tone, label, value, note, good }: {
  icon: string; tone: string; label: string; value: string; note: string; good: boolean | null;
}) {
  return (
    <div className="ovh__c">
      <span className={`ovh__ico ovs__ico--${tone}`}><Icon name={icon} size={16} /></span>
      <span className="ovh__body">
        <span className="ovh__l">{label}</span>
        <span className={`ovh__v${good === true ? " ok" : good === false ? " bad" : ""}`}>{value}</span>
        <span className="ovh__n">{note}</span>
      </span>
    </div>
  );
}
