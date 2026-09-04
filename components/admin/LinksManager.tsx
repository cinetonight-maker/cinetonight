"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { api } from "./shared";
import type { LinkReport, LinkTarget } from "@/lib/linkGraph";

/* ============================================================================
 * /admin/links — Internal Links.
 *
 * Three questions this screen answers, which nothing in the old dashboard
 * could:
 *   1. Are any of my links broken?  (links to posts that were renamed/trashed)
 *   2. Which of my pages does nothing link to?  (Google finds those last)
 *   3. Which posts are dead ends?  (no links out, so readers stop there)
 *
 * Everything shown is measured from the real article text in the database.
 * There is no estimate and no placeholder anywhere on this screen.
 * ========================================================================= */

const KIND_LABEL: Record<LinkTarget["kind"], string> = {
  post: "Blog post", page: "Page", movie: "Movie", series: "Series", free: "Free movie", section: "Section",
};

export default function LinksManager() {
  const [report, setReport] = useState<LinkReport | null>(null);
  const [targets, setTargets] = useState<LinkTarget[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ report?: LinkReport; targets?: LinkTarget[]; error?: string }>("/api/admin/links");
    if (res.ok && res.data.report) { setReport(res.data.report); setTargets(res.data.targets ?? []); setErr(null); }
    else setErr(res.data.error ?? "Could not check links.");
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const editHref = (d: { kind: "post" | "page" }) => (d.kind === "post" ? "/admin/blog" : "/admin/pages");

  if (loading) return <div className="empty">Checking every link on the site…</div>;
  if (err) return <div className="ad__err">{err}</div>;
  if (!report) return null;

  const clean = !report.broken.length && !report.orphans.length && !report.thin.length;

  return (
    <div className="ad__body ad__body--one">
      <div className="ovs">
        <Stat label="Pages checked" value={report.totals.documents} icon="article" tone="violet" />
        <Stat label="Internal links" value={report.totals.internalLinks} icon="arrow" tone="blue" />
        <Stat label="Broken links" value={report.broken.length} icon="x" tone="amber" bad={report.broken.length > 0} />
        <Stat label="Nothing links here" value={report.orphans.length} icon="compass" tone="pink" warn={report.orphans.length > 0} />
        <Stat label="Dead ends" value={report.thin.length} icon="info" tone="teal" warn={report.thin.length > 0} />
        <Stat label="Out to other sites" value={report.totals.externalLinks} icon="grid" tone="green" />
      </div>

      {clean && (
        <div className="ad__panel">
          <div className="ad__ok" style={{ fontSize: 14 }}>
            <Icon name="check" size={15} /> Every internal link works, every published page is linked to,
            and no post is a dead end. Nothing to fix.
          </div>
        </div>
      )}

      {/* ---------------------------- broken ---------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead">
          <h2>Broken links <span className="ad__count">{report.broken.length}</span></h2>
          <button className="ad__mini" onClick={load}>Re-check</button>
        </div>
        <p className="ad__hintline">
          These point at pages that do not exist - usually a post that was renamed or moved to Trash.
          A reader clicking one lands on a “not found” page, and Google counts it against the site. Fix these first.
        </p>
        <div className="ad__list">
          {report.broken.map((b, i) => (
            <div className="ad__row" key={`${b.from.id}-${b.href}-${i}`}>
              <span className="ad__cat ad__cat--bad">broken</span>
              <span className="ad__name">{b.text || "(no link text)"} → <code>{b.href}</code></span>
              <span className="ad__meta">in “{b.from.title}”</span>
              <Link className="ad__mini" href={editHref(b.from)}>Fix</Link>
            </div>
          ))}
          {!report.broken.length && <div className="ad__empty">No broken links. </div>}
        </div>
      </section>

      {/* --------------------------- orphans ----------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Nothing links to these <span className="ad__count">{report.orphans.length}</span></h2></div>
        <p className="ad__hintline">
          These pages are live but no other page on the site points to them. Google reaches them only through the
          sitemap, so they rank slower. Add a link to each from a related post.
        </p>
        <div className="ad__list">
          {report.orphans.map((o) => (
            <div className="ad__row" key={o.path}>
              <span className="ad__cat">{o.kind === "post" ? "post" : "page"}</span>
              <span className="ad__name">{o.title}</span>
              <span className="ad__meta">{o.path}</span>
              <a className="ad__mini" href={o.path} target="_blank" rel="noreferrer">View</a>
              <Link className="ad__mini" href={editHref(o)}>Edit</Link>
            </div>
          ))}
          {!report.orphans.length && <div className="ad__empty">Every live page is linked to from somewhere.</div>}
        </div>
      </section>

      {/* ---------------------------- thin ------------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Dead ends <span className="ad__count">{report.thin.length}</span></h2></div>
        <p className="ad__hintline">
          Live pages with fewer than two links out to the rest of CineTonight. A reader who finishes one of these
          has nowhere obvious to go next, so they leave. Two links is the working minimum: one deeper into the site,
          one back to a hub like Free Movies or Discover.
        </p>
        <div className="ad__list">
          {report.thin.map((t) => (
            <div className="ad__row" key={t.path}>
              <span className="ad__cat">{t.outbound} link{t.outbound === 1 ? "" : "s"} out</span>
              <span className="ad__name">{t.title}</span>
              <span className="ad__meta">{t.path}</span>
              <Link className="ad__mini" href={editHref(t)}>Add links</Link>
            </div>
          ))}
          {!report.thin.length && <div className="ad__empty">No dead ends.</div>}
        </div>
      </section>

      {/* -------------------------- unverified --------------------------- */}
      {report.unverified.length > 0 && (
        <section className="ad__panel">
          <div className="ad__panelhead"><h2>Not checked <span className="ad__count">{report.unverified.length}</span></h2></div>
          <p className="ad__hintline">
            Links to actor pages, channels and TMDB-only titles. Those pages are built on demand from TMDB, so there
            is no list to check them against. They are almost certainly fine - shown here only so nothing is hidden.
          </p>
          <div className="ad__list">
            {report.unverified.slice(0, 25).map((u, i) => (
              <div className="ad__row" key={`${u.from.id}-${u.href}-${i}`}>
                <span className="ad__name">{u.text || "(no link text)"} → <code>{u.href}</code></span>
                <span className="ad__meta">in “{u.from.title}”</span>
              </div>
            ))}
            {report.unverified.length > 25 && <div className="ad__empty">+ {report.unverified.length - 25} more</div>}
          </div>
        </section>
      )}

      {/* -------------------------- most linked -------------------------- */}
      <section className="ad__panel">
        <div className="ad__panelhead"><h2>Most linked-to pages</h2></div>
        <p className="ad__hintline">
          Where your own links point most often. These are the pages you are telling Google matter most -
          worth checking that they are the ones you actually want ranking.
        </p>
        <div className="ad__list">
          {Object.entries(report.inbound)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([path, n]) => {
              const t = targets.find((x) => x.path === path);
              return (
                <div className="ad__row" key={path}>
                  <span className="ad__cat">{n} link{n === 1 ? "" : "s"}</span>
                  <span className="ad__name">{t?.label ?? path}</span>
                  <span className="ad__meta">{t ? KIND_LABEL[t.kind] : "unknown page"} · {path}</span>
                </div>
              );
            })}
          {!Object.keys(report.inbound).length && <div className="ad__empty">No internal links anywhere yet.</div>}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, icon, tone, bad, warn }: {
  label: string; value: number; icon: string; tone: string; bad?: boolean; warn?: boolean;
}) {
  return (
    <div className="ovs__c ovs__c--flat">
      <div className="ovs__top">
        <span className={`ovs__ico ovs__ico--${tone}`}><Icon name={icon} size={16} /></span>
        <span className="ovs__lab">{label}</span>
      </div>
      <div className={`ovs__v${bad ? " bad" : warn ? " warn" : ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}
