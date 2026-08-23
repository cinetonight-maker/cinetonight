"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

/* ============================================================================
 * Overview — the admin landing screen.
 *
 * Built to the approved design, with one rule that overrides the mockup:
 * EVERY FIGURE IS READ FROM THE DATABASE (/api/admin/overview). The mockup's
 * sample numbers, sample activity feed and decorative charts are not copied.
 * Where the design shows a sparkline, this screen draws one only if the real
 * weekly history could be computed; where it cannot, the card simply has no
 * sparkline. A value that cannot be read prints "—", never a plausible guess.
 * ========================================================================= */

interface Trend { week: number | null; spark: number[] | null }

interface Data {
  counts: Record<string, number | null>;
  trend: Record<string, Trend>;
  categories: { label: string; n: number }[];
  tags: { label: string; n: number }[];
  activity: { at: string; title: string; where: string; href: string; icon: string }[];
  upcoming: { title: string; publish_at: string | null; slug: string; image_url: string | null }[];
  attention: { kind: string; title: string; slug: string }[];
  attentionTotal: number;
  lastSync: { at: string | null; ok: boolean | null };
  tmdb: { ok: boolean | null; ms: number | null };
  build: string | null;
  supabase: boolean;
}

const n = (v: number | null | undefined) => (typeof v === "number" ? v.toLocaleString("en-US") : "—");

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(Math.abs(diff) / 60000);
  const rel = mins < 1 ? "just now" : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  if (rel === "just now") return rel;
  return diff >= 0 ? `${rel} ago` : `in ${rel}`;
}

/** A sparkline drawn from real weekly counts. Returns null for no data — a
 *  decorative line with nothing behind it would be a lie on a dashboard. */
function Spark({ points, color }: { points: number[] | null; color: string }) {
  if (!points || points.length < 2 || points.every((p) => p === 0)) return null;
  const max = Math.max(...points, 1);
  const w = 100, h = 30;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * (h - 4) - 2).toFixed(1)}`).join(" ");
  const area = `${d} L${w},${h} L0,${h} Z`;
  const id = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg className="ovs__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Delta line under a stat. Shows nothing at all when the history is unknown. */
function Delta({ week }: { week: number | null }) {
  if (week === null) return <span className="ovs__delta ovs__delta--none">last 8 weeks</span>;
  if (week === 0) return <span className="ovs__delta ovs__delta--none">none this week</span>;
  return <span className="ovs__delta ovs__delta--up">+{week} this week</span>;
}

/** Donut built from the four real content counts. */
function Donut({ slices, total }: { slices: { label: string; n: number; color: string }[]; total: number }) {
  const r = 52, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="ovd">
      <svg className="ovd__svg" viewBox="0 0 140 140" role="img" aria-label={`${total} items in total`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--line)" strokeWidth="16" />
        {total > 0 && slices.map((s) => {
          const len = (s.n / total) * c;
          const el = (
            <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              transform="rotate(-90 70 70)" />
          );
          offset += len;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" className="ovd__num">{total.toLocaleString()}</text>
        <text x="70" y="84" textAnchor="middle" className="ovd__lab">Total</text>
      </svg>
      <ul className="ovd__legend">
        {slices.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.n.toLocaleString()}{total > 0 && ` (${Math.round((s.n / total) * 100)}%)`}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ title, rows, href }: { title: string; rows: { label: string; n: number }[]; href?: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="ovb">
      <div className="ovb__h">{title}{href && <Link className="ov__more" href={href}>Manage</Link>}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.label}>
            <span className="ovb__l" title={r.label}>{r.label}</span>
            <span className="ovb__t"><i style={{ width: `${Math.max(6, (r.n / max) * 100)}%` }} /></span>
            <b>{r.n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

const QUICK = [
  { href: "/admin/blog", icon: "article", label: "New Blog Post", tone: "violet" },
  { href: "/admin/pages", icon: "article", label: "New Page", tone: "blue" },
  { href: "/admin/catalogue", icon: "film", label: "Add Title", tone: "green" },
  { href: "/admin/media", icon: "tv", label: "Upload Media", tone: "amber" },
  { href: "/admin/homepage", icon: "grid", label: "Edit Homepage", tone: "pink" },
  { href: "/admin/links", icon: "arrow", label: "Check Links", tone: "teal" },
  { href: "/admin/comments", icon: "reply", label: "Comments", tone: "blue" },
  { href: "/admin/settings", icon: "user", label: "Site Settings", tone: "violet" },
];

export default function Overview() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((j) => (j?.counts ? setD(j) : setErr(j?.error ?? "Could not load dashboard data.")))
      .catch(() => setErr("Could not reach the server."));
  }, []);

  if (err) return <div className="ad__err">{err}</div>;
  if (!d) return <div className="empty">Loading…</div>;

  const healthy = d.supabase && d.tmdb.ok !== false;

  const stats = [
    { label: "Titles in catalogue", value: d.counts.titles, href: "/admin/catalogue", icon: "film", tone: "violet", color: "#a78bfa", trend: d.trend.titles },
    { label: "Published posts", value: d.counts.published, href: "/admin/blog", icon: "article", tone: "blue", color: "#60a5fa", trend: d.trend.posts },
    { label: "Pages", value: d.counts.pages, href: "/admin/pages", icon: "grid", tone: "green", color: "#34d399", trend: d.trend.pages },
    { label: "Drafts", value: d.counts.drafts, href: "/admin/blog", icon: "article", tone: "amber", color: "#fbbf24", trend: null },
    { label: "Free movies", value: d.counts.freeMovies, href: "/admin/free-movies", icon: "playc", tone: "pink", color: "#f472b6", trend: d.trend.free },
    { label: "Media files", value: d.counts.media, href: "/admin/media", icon: "tv", tone: "teal", color: "#2dd4bf", trend: d.trend.media },
  ];

  const total = ["published", "drafts", "scheduled", "pages"]
    .reduce((s, k) => s + (d.counts[k] ?? 0), 0);
  const slices = [
    { label: "Published", n: d.counts.published ?? 0, color: "#a78bfa" },
    { label: "Drafts", n: d.counts.drafts ?? 0, color: "#60a5fa" },
    { label: "Scheduled", n: d.counts.scheduled ?? 0, color: "#34d399" },
    { label: "Pages", n: d.counts.pages ?? 0, color: "#fb923c" },
  ];

  return (
    <div className="ov">
      {/* ---------------------------- stat row ---------------------------- */}
      <section className="ovs">
        {stats.map((s) => (
          <Link className="ovs__c" href={s.href} key={s.label}>
            <div className="ovs__top">
              <span className={`ovs__ico ovs__ico--${s.tone}`}><Icon name={s.icon} size={16} /></span>
              <span className="ovs__lab">{s.label}</span>
            </div>
            <div className="ovs__v">{n(s.value)}</div>
            {s.trend ? <Delta week={s.trend.week} /> : <span className="ovs__delta ovs__delta--none">right now</span>}
            {s.trend && <Spark points={s.trend.spark} color={s.color} />}
          </Link>
        ))}
        <div className="ovs__c ovs__c--health">
          <div className="ovs__top">
            <span className={`ovs__ico ${healthy ? "ovs__ico--green" : "ovs__ico--amber"}`}><Icon name="check" size={16} /></span>
            <span className="ovs__lab">Site health</span>
          </div>
          <div className={`ovs__v ovs__v--word ${healthy ? "ok" : "warn"}`}>{healthy ? "Healthy" : "Check"}</div>
          <span className="ovs__delta ovs__delta--none">
            {healthy ? "Database and TMDB responding" : "See System below"}
          </span>
        </div>
      </section>

      {/* ---------------------------- 3 columns ---------------------------- */}
      <div className="ovg">
        {/* recent activity */}
        <section className="ov__card">
          <div className="ov__cardhead">
            <h2>Recent activity</h2>
            <span className="ov__more">Last changes you made</span>
          </div>
          {d.activity.length === 0 ? (
            <p className="ov__empty">Nothing has been edited yet. Anything you change will appear here.</p>
          ) : (
            <ul className="ova">
              {d.activity.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <Link href={a.href} className="ova__row">
                    <span className="ova__ico"><Icon name={a.icon} size={15} /></span>
                    <span className="ova__body">
                      <span className="ova__t">{a.title}</span>
                      <span className="ova__w">{a.where}</span>
                    </span>
                    <span className="ova__when">{when(a.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* content at a glance */}
        <section className="ov__card">
          <div className="ov__cardhead">
            <h2>Content at a glance</h2>
            <Link className="ov__more" href="/admin/blog">View all</Link>
          </div>
          <Donut slices={slices} total={total} />
          <div className="ovb__wrap">
            <Bars title="Top categories" rows={d.categories} />
            {d.tags.length > 0
              ? <Bars title="Most used tags" rows={d.tags} />
              : (
                <div className="ovb">
                  <div className="ovb__h">Most used tags</div>
                  <p className="ov__empty">No tags yet. Add them while writing a post and they will be counted here.</p>
                </div>
              )}
          </div>
        </section>

        {/* schedule + quick actions */}
        <div className="ovcol">
          <section className="ov__card">
            <div className="ov__cardhead">
              <h2>Upcoming schedule</h2>
              <Link className="ov__more" href="/admin/blog">Manage</Link>
            </div>
            {d.upcoming.length === 0 ? (
              <p className="ov__empty">Nothing scheduled. Posts you schedule appear here with their exact publish time.</p>
            ) : (
              <ul className="ovu">
                {d.upcoming.map((u) => (
                  <li key={u.slug}>
                    {u.image_url
                      ? <img className="ovu__th" alt="" src={u.image_url} />
                      : <span className="ovu__th ovu__th--empty"><Icon name="article" size={14} /></span>}
                    <span className="ovu__body">
                      <span className="ovu__t">{u.title} <em className="ovu__pill">scheduled</em></span>
                      <span className="ovu__m">
                        {u.publish_at
                          ? new Date(u.publish_at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                        {" · "}{when(u.publish_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {d.attention.length > 0 && (
            <section className="ov__card">
              <div className="ov__cardhead">
                <h2>Needs attention</h2>
                {d.attentionTotal > d.attention.length && <span className="ov__more">{d.attentionTotal} total</span>}
              </div>
              <ul className="ov__list">
                {d.attention.map((a, i) => (
                  <li key={a.slug + i}>
                    <span className="ov__listmain">{a.title}</span>
                    <span className="ov__listmeta"><span className="ov__chip ov__chip--warn">{a.kind}</span></span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ov__card">
            <div className="ov__cardhead"><h2>Quick actions</h2></div>
            <div className="ovq">
              {QUICK.map((q) => (
                <Link className="ovq__b" href={q.href} key={q.label}>
                  <span className={`ovq__ico ovs__ico--${q.tone}`}><Icon name={q.icon} size={16} /></span>
                  <span>{q.label}</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* ---------------------------- system ---------------------------- */}
      <section className="ov__card">
        <div className="ov__cardhead">
          <h2>System</h2>
          <span className={`ov__more ${healthy ? "ok" : "warn"}`}>
            {healthy ? "All systems responding" : "Something needs a look"}
          </span>
        </div>
        <div className="ovh">
          <Health icon="grid" tone="blue" label="Database"
            value={d.supabase ? "Connected" : "Unreachable"} good={d.supabase}
            note={d.supabase ? "Supabase answering" : "Check your keys"} />
          <Health icon="film" tone="green" label="TMDB API"
            value={d.tmdb.ok === null ? "Not configured" : d.tmdb.ok ? "Responding" : "No answer"}
            good={d.tmdb.ok === null ? null : d.tmdb.ok}
            note={d.tmdb.ms !== null ? `${d.tmdb.ms} ms` : "No key set"} />
          <Health icon="trend" tone="violet" label="Last catalogue sync"
            value={when(d.lastSync.at)} good={d.lastSync.ok}
            note={d.lastSync.at ? new Date(d.lastSync.at).toLocaleString() : "Never run"} />
          <Health icon="reply" tone="amber" label="Comments"
            value={n(d.counts.comments)} good={(d.counts.comments ?? 0) === 0}
            note={(d.counts.comments ?? 0) === 0 ? "Nothing to review" : "Waiting for review"} />
          <Health icon="tv" tone="teal" label="Media files"
            value={n(d.counts.media)} good={null} note="In the library" />
          <Health icon="check" tone="pink" label="Build"
            value={d.build ? d.build.slice(0, 8) : "—"} good={null}
            note={d.build ? "Running version" : "Not reported locally"} />
        </div>
      </section>
    </div>
  );
}

function Health({ icon, tone, label, value, note, good }: {
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
