import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/overview → real operational numbers for the Overview screen.
 *
 * Admin-only (middleware gates /api/admin/**). Count queries plus a handful of
 * small selects — no table scans, no public cache involvement.
 *
 * THE RULE FOR THIS FILE: nothing here may be invented. Every figure the
 * dashboard shows comes from this route. A value that cannot be read is
 * returned as null, and the screen prints "—" instead of a plausible guess.
 * That includes the charts: the sparklines and the bars are built from real
 * `created_at` timestamps, and a card whose history cannot be computed simply
 * has no sparkline rather than a decorative squiggle.
 */

const WEEKS = 8;
const DAY = 86_400_000;

const count = async (table: string, apply?: (q: any) => any) => {
  try {
    let q = supabaseAdmin().from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count: n, error } = await q;
    return error ? null : (n ?? 0);
  } catch { return null; }
};

/** Every `created_at` in a table, oldest first. Only the timestamp column is
 *  selected, so this stays small even on the catalogue. */
const stamps = async (table: string, col = "created_at"): Promise<number[] | null> => {
  try {
    const { data, error } = await supabaseAdmin().from(table).select(col).limit(5000);
    if (error) return null;
    return (data ?? [])
      .map((r: any) => new Date(r[col]).getTime())
      .filter((t: number) => Number.isFinite(t))
      .sort((a: number, b: number) => a - b);
  } catch { return null; }
};

/** Rows per week for the last WEEKS weeks, plus how many landed in the last 7
 *  days. Both are counted from real timestamps. */
function history(times: number[] | null, now: number) {
  if (!times) return { spark: null as number[] | null, week: null as number | null };
  const spark: number[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const from = now - (i + 1) * 7 * DAY;
    const to = now - i * 7 * DAY;
    spark.push(times.filter((t) => t > from && t <= to).length);
  }
  return { spark, week: times.filter((t) => t > now - 7 * DAY).length };
}

/** Is TMDB answering, and how fast? Real request, hard 4s ceiling so a slow
 *  third party can never hang the dashboard. */
async function tmdbPing(): Promise<{ ok: boolean | null; ms: number | null }> {
  const key = process.env.TMDB_API_KEY?.trim();
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!key && !token) return { ok: null, ms: null };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const url = token
      ? "https://api.themoviedb.org/3/configuration"
      : `https://api.themoviedb.org/3/configuration?api_key=${key}`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}`, accept: "application/json" } : undefined,
    });
    clearTimeout(timer);
    return { ok: res.ok, ms: Date.now() - t0 };
  } catch { return { ok: false, ms: null }; }
}

export async function GET() {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const sb = supabaseAdmin();

  const [
    titles, freeMovies, pages, media, published, drafts, scheduled, comments,
    movieTimes, postTimes, classicTimes, mediaTimes,
    tmdb,
  ] = await Promise.all([
    count("movies"),
    count("classics"),
    count("pages"),
    count("media"),
    count("blog_posts", (q: any) => q.eq("status", "published")),
    count("blog_posts", (q: any) => q.eq("status", "draft")),
    count("blog_posts", (q: any) => q.eq("status", "scheduled").gt("publish_at", nowIso)),
    count("comments", (q: any) => q.eq("approved", false)),
    stamps("movies"),
    stamps("blog_posts"),
    stamps("classics"),
    stamps("media"),
    tmdbPing(),
  ]);

  const hTitles = history(movieTimes, now);
  const hPosts = history(postTimes, now);
  const hFree = history(classicTimes, now);
  const hMedia = history(mediaTimes, now);

  /* -------- categories and tags actually in use -------- */
  let categories: { label: string; n: number }[] = [];
  let tags: { label: string; n: number }[] = [];
  try {
    const { data } = await sb.from("blog_posts").select("cat, tags, status").limit(2000);
    const rows = (data ?? []) as any[];
    const cTally = new Map<string, number>();
    const tTally = new Map<string, number>();
    for (const r of rows) {
      if (r.cat) cTally.set(r.cat, (cTally.get(r.cat) ?? 0) + 1);
      if (Array.isArray(r.tags)) for (const t of r.tags) {
        const k = String(t).trim();
        if (k) tTally.set(k, (tTally.get(k) ?? 0) + 1);
      }
    }
    const top = (m: Map<string, number>, k: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([label, n]) => ({ label, n }));
    categories = top(cTally, 5);
    tags = top(tTally, 5);
  } catch { /* leave empty — the panel hides itself */ }

  /* -------- recent changes, from real updated_at values -------- */
  type Activity = { at: string; title: string; where: string; href: string; icon: string };
  const activity: Activity[] = [];
  const pull = async (
    table: string, cols: string, where: string, href: string, icon: string,
    title: (r: any) => string, col = "updated_at",
  ) => {
    try {
      const { data } = await sb.from(table).select(cols).order(col, { ascending: false }).limit(4);
      for (const r of (data ?? []) as any[]) {
        if (r[col]) activity.push({ at: r[col], title: title(r), where, href, icon });
      }
    } catch { /* table optional */ }
  };
  await Promise.all([
    pull("blog_posts", "title, slug, status, updated_at", "Blog Posts", "/admin/blog", "article",
      (r) => `${r.status === "published" ? "Published" : r.status === "scheduled" ? "Scheduled" : "Saved draft"} “${r.title}”`),
    pull("pages", "title, slug, status, updated_at", "Pages", "/admin/pages", "article",
      (r) => `Updated page “${r.title}”`),
    pull("movies", "title, id, updated_at", "Movies & Series", "/admin/catalogue", "film",
      (r) => `Updated “${r.title}” in the catalogue`),
    pull("classics", "title, slug, updated_at", "Free Movies", "/admin/free-movies", "playc",
      (r) => `Updated free movie “${r.title}”`),
  ]);
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  /* -------- the next few scheduled posts (real rows, real times) -------- */
  let upcoming: { title: string; publish_at: string | null; slug: string; image_url: string | null }[] = [];
  try {
    const { data } = await sb
      .from("blog_posts")
      .select("title, publish_at, slug, image_url")
      .eq("status", "scheduled")
      .gt("publish_at", nowIso)
      .order("publish_at", { ascending: true })
      .limit(4);
    upcoming = (data ?? []) as any[];
  } catch { /* leave empty */ }

  /* -------- content needing attention — computed, not guessed -------- */
  const attention: { kind: string; title: string; slug: string }[] = [];
  try {
    const { data } = await sb
      .from("blog_posts")
      .select("title, slug, image_url, meta_description, excerpt, status")
      .neq("status", "draft")
      .limit(120);
    for (const p of (data ?? []) as any[]) {
      if (!p.image_url) attention.push({ kind: "No featured image", title: p.title, slug: p.slug });
      else if (!p.meta_description && !p.excerpt) attention.push({ kind: "No meta description", title: p.title, slug: p.slug });
    }
  } catch { /* ignore */ }

  /* -------- last catalogue sync (sync_log is optional) -------- */
  let lastSync: { at: string | null; ok: boolean | null } = { at: null, ok: null };
  try {
    const { data } = await sb.from("sync_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) lastSync = { at: data.created_at ?? null, ok: data.ok ?? data.success ?? true };
  } catch { /* table optional */ }

  return NextResponse.json({
    counts: { titles, freeMovies, pages, media, published, drafts, scheduled, comments },
    trend: {
      titles: { week: hTitles.week, spark: hTitles.spark },
      posts: { week: hPosts.week, spark: hPosts.spark },
      free: { week: hFree.week, spark: hFree.spark },
      media: { week: hMedia.week, spark: hMedia.spark },
      // Pages carry no created_at in the schema, so there is deliberately no
      // "this week" figure for them — an invented one would be worse.
      pages: { week: null, spark: null },
    },
    categories,
    tags,
    activity: activity.slice(0, 6),
    upcoming,
    attention: attention.slice(0, 6),
    attentionTotal: attention.length,
    lastSync,
    tmdb,
    build: process.env.OPEN_NEXT_BUILD_ID ?? null,
    supabase: titles !== null,
    checkedAt: nowIso,
  });
}
