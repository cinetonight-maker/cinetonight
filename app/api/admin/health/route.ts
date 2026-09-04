import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runRetentionSweep } from "@/lib/retention";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/health — what is actually running, and what setup is still owed.
 *
 * READ ONLY. GET and nothing else.
 *
 * THE RULE FOR THIS ROUTE: report only what can be MEASURED. Where a figure
 * lives somewhere this worker cannot see — R2 object counts and Class A
 * operations live in the Cloudflare dashboard, and reading them would mean
 * embedding a Cloudflare API token purely to display a number — the screen
 * says where to look instead of inventing a value. That is a deliberate call
 * from the CMS brief: no credentials for the sake of a chart.
 * ========================================================================= */

/** Does this table exist and can we read it? Used for the setup checklist —
 *  a `head: true` count is the cheapest possible probe. */
async function probe(table: string): Promise<{ ok: boolean; rows: number | null }> {
  try {
    const { count, error } = await supabaseAdmin().from(table).select("*", { count: "exact", head: true });
    if (error) return { ok: false, rows: null };
    return { ok: true, rows: count ?? 0 };
  } catch { return { ok: false, rows: null }; }
}

/** Has a column arrived yet? Selecting it is the only honest test. */
async function probeColumn(table: string, column: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin().from(table).select(column).limit(1);
    return !error;
  } catch { return false; }
}

async function tmdbPing(): Promise<{ ok: boolean | null; ms: number | null }> {
  const key = process.env.TMDB_API_KEY?.trim();
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!key && !token) return { ok: null, ms: null };
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const url = token ? "https://api.themoviedb.org/3/configuration" : `https://api.themoviedb.org/3/configuration?api_key=${key}`;
    const res = await fetch(url, {
      signal: ctrl.signal, cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}`, accept: "application/json" } : undefined,
    });
    clearTimeout(timer);
    return { ok: res.ok, ms: Date.now() - t0 };
  } catch { return { ok: false, ms: null }; }
}

export async function GET() {
  const now = Date.now();

  const [
    posts, pages, movies, classics, media, comments, auditLog,
    blogRevs, pageRevs, homepageCfg, discoveryCfg,
    blogTrashCol, pageTrashCol,
    tmdb,
  ] = await Promise.all([
    probe("blog_posts"), probe("pages"), probe("movies"), probe("classics"),
    probe("media"), probe("comments"), probe("audit_log"),
    probe("blog_revisions"), probe("page_revisions"),
    probe("homepage_config"), probe("discovery_config"),
    probeColumn("blog_posts", "deleted_at"), probeColumn("pages", "deleted_at"),
    tmdbPing(),
  ]);

  // The four files added after the original checklist was written. Without
  // these rows this screen reported "all done" while two migrations were
  // outstanding — which is the one thing it exists not to do.
  const [settingsRevs, blogSeoCol, redirectsTbl] = await Promise.all([
    probe("settings_revisions"),
    probeColumn("blog_posts", "focus_keyword"),
    probe("redirects"),
  ]);
  // A function, not a table, so it needs its own check.
  let retentionFn = false;
  try {
    const { error } = await supabaseAdmin().rpc("prune_retention");
    retentionFn = !error;
  } catch { retentionFn = false; }

  /* -------- storage we can actually measure: the media library -------- */
  let storage: { files: number; bytes: number; largest: { name: string; size: number } | null } | null = null;
  try {
    const { data } = await supabaseAdmin().from("media").select("name, size").limit(5000);
    const rows = (data ?? []) as { name: string; size: number | null }[];
    const bytes = rows.reduce((s, r) => s + (r.size ?? 0), 0);
    const largest = rows.reduce<{ name: string; size: number } | null>(
      (best, r) => ((r.size ?? 0) > (best?.size ?? 0) ? { name: r.name, size: r.size ?? 0 } : best), null);
    storage = { files: rows.length, bytes, largest };
  } catch { /* leave null */ }

  /* -------- last sync -------- */
  let lastSync: { at: string | null; ok: boolean | null } = { at: null, ok: null };
  try {
    const { data } = await supabaseAdmin().from("sync_log").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) lastSync = { at: data.created_at ?? null, ok: data.ok ?? data.success ?? true };
  } catch { /* optional table */ }

  /* -------- content that would look broken to a visitor -------- */
  const broken: { kind: string; title: string; where: string }[] = [];
  try {
    const { data } = await supabaseAdmin()
      .from("blog_posts").select("title, slug, image_url, excerpt, meta_description, status, deleted_at").limit(200);
    for (const p of (data ?? []) as any[]) {
      if (p.deleted_at || p.status === "draft") continue;
      if (!p.image_url) broken.push({ kind: "No featured image", title: p.title, where: "Blog Posts" });
      else if (!p.excerpt && !p.meta_description) broken.push({ kind: "No description", title: p.title, where: "Blog Posts" });
    }
  } catch { /* ignore */ }
  try {
    const { data } = await supabaseAdmin().from("pages").select("title, content, status, deleted_at").limit(200);
    for (const p of (data ?? []) as any[]) {
      if (p.deleted_at || p.status !== "published") continue;
      if (!p.content?.trim()) broken.push({ kind: "Published but empty", title: p.title, where: "Pages" });
    }
  } catch { /* ignore */ }

  /* -------- the setup checklist -------- */
  const setup = [
    { id: "blog_cms", label: "Blog CMS database update", file: "supabase/blog_cms.sql",
      done: blogRevs.ok && blogTrashCol, unlocks: "Trash, version history, autosave recovery, tags, image alt text" },
    { id: "pages_cms", label: "Pages database update", file: "supabase/pages_cms.sql",
      done: pageRevs.ok && pageTrashCol, unlocks: "Trash, version history, page SEO fields" },
    { id: "audit_log", label: "Activity log", file: "supabase/audit_log.sql",
      done: auditLog.ok, unlocks: "Who changed what, and when" },
    { id: "homepage_cms", label: "Homepage Manager", file: "supabase/homepage_cms.sql",
      done: homepageCfg.ok, unlocks: "Hero copy, section order and headings" },
    { id: "discovery_cms", label: "Discovery Manager", file: "supabase/discovery_cms.sql",
      done: discoveryCfg.ok, unlocks: "Moods, Quick Picks, Explore tabs, streaming services" },
    { id: "settings_cms", label: "Settings history", file: "supabase/settings_cms.sql",
      done: settingsRevs.ok, unlocks: "Draft, publish and rollback for site settings" },
    { id: "blog_seo", label: "Blog SEO fields", file: "supabase/blog_seo.sql",
      done: blogSeoCol, unlocks: "Focus keyword, canonical, social image, hide-from-search" },
    { id: "redirects", label: "Redirects", file: "supabase/redirects.sql",
      done: redirectsTbl.ok, unlocks: "Send an old address to a new one without a deploy" },
    { id: "retention", label: "History cleanup", file: "supabase/retention.sql",
      done: retentionFn, unlocks: "Keeps the 500 MB database from filling with old history" },
  ];

  /* -------- instant publishing: configured or not -------- */
  // These are Worker bindings/secrets, so their PRESENCE is all this process
  // can see — never their values, and they are never returned.
  const instantPublish = {
    tagCache: !!process.env.NEXT_TAG_CACHE_D1 || null, // binding, not a plain env var — see the note in the UI
    purgeConfigured: !!(process.env.CACHE_PURGE_ZONE_ID && process.env.CACHE_PURGE_API_TOKEN),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };

  return NextResponse.json({
    checkedAt: new Date(now).toISOString(),
    services: {
      database: { ok: posts.ok, detail: posts.ok ? "Supabase answering" : "Unreachable — check the keys" },
      tmdb,
      lastSync,
      build: process.env.OPEN_NEXT_BUILD_ID ?? null,
    },
    counts: {
      posts: posts.rows, pages: pages.rows, movies: movies.rows,
      classics: classics.rows, media: media.rows, comments: comments.rows,
      auditEntries: auditLog.rows,
    },
    storage,
    broken: broken.slice(0, 12),
    brokenTotal: broken.length,
    setup,
    instantPublish,
  });
}


/** POST { action: "prune" } — run the retention sweep by hand.
 *
 *  Exists because pg_cron is not guaranteed on the Free plan, and a retention
 *  policy that silently depends on a scheduler nobody set up is not a policy.
 *  Content is never touched: only history past the documented window. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "prune") {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    const result = await runRetentionSweep();
    if (!result) {
      return NextResponse.json({
        error: "Cleanup needs its database function. Run supabase/retention.sql in Supabase → SQL Editor, then try again.",
        needsSetup: true,
      }, { status: 400 });
    }
    const total = result.reduce((sum, r) => sum + Number(r.rows_deleted ?? 0), 0);
    await recordAudit({
      module: "settings", action: "delete", targetLabel: "History cleanup",
      before: null, after: { removed: total, detail: result },
      note: `Retention sweep removed ${total} history rows`,
    });
    return NextResponse.json({ ok: true, removed: total, detail: result });
  } catch (e) {
    return NextResponse.json({ error: `Cleanup failed: ${(e as Error).message}` }, { status: 500 });
  }
}
