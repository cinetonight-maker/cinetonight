import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildLinkReport, type DocumentRef, type LinkTarget } from "@/lib/linkGraph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/links — the internal-link picture of the whole site.
 *
 * GET                → full report (broken links, orphans, thin pages)
 * GET ?targets=1     → just the list of linkable pages, for the editor picker
 *
 * Admin-only (middleware guards /api/admin/**), force-dynamic, service-role.
 * Nothing here is cached and nothing here touches the public cache: it reads
 * the database directly so what it reports is what is actually stored.
 * ========================================================================= */

/** Everything on CineTonight that can be linked to and that we can enumerate.
 *  People and channels are deliberately absent — their id space is unbounded,
 *  and lib/linkGraph.ts treats links into them as "unverified", not broken. */
async function inventory(): Promise<LinkTarget[]> {
  const sb = supabaseAdmin();
  const [posts, pages, movies, classics] = await Promise.all([
    sb.from("blog_posts").select("slug, title, status, deleted_at"),
    sb.from("pages").select("slug, title, status"),
    sb.from("movies").select("id, title, kind"),
    sb.from("classics").select("slug, title, status"),
  ]);

  const out: LinkTarget[] = [];

  for (const p of posts.data ?? []) {
    // A trashed or draft post is not a valid link target: linking to it sends
    // readers to a 404 until (and unless) it is published.
    if ((p as any).deleted_at || p.status === "draft") continue;
    out.push({ path: `/blog/${p.slug}`, label: p.title, kind: "post" });
  }
  for (const p of pages.data ?? []) {
    if (p.status !== "published") continue;
    out.push({ path: `/${p.slug}`, label: p.title, kind: "page" });
  }
  for (const m of movies.data ?? []) {
    out.push({ path: `/movie/${m.id}`, label: m.title, kind: m.kind === "series" ? "series" : "movie" });
  }
  for (const c of classics.data ?? []) {
    if (c.status && c.status !== "published") continue;
    out.push({ path: `/free-movies/${c.slug}`, label: c.title, kind: "free" });
  }

  // The main sections, so the picker can offer "link to the Free Movies hub".
  out.push(
    { path: "/", label: "Home", kind: "section" },
    { path: "/blog", label: "Blog", kind: "section" },
    { path: "/discover", label: "Discover", kind: "section" },
    { path: "/free-movies", label: "Free Movies", kind: "section" },
    { path: "/genres", label: "Genres", kind: "section" },
    { path: "/latest", label: "Latest", kind: "section" },
    { path: "/trending", label: "Trending", kind: "section" },
    { path: "/movies", label: "Movies", kind: "section" },
    { path: "/web-series", label: "Web Series", kind: "section" },
    { path: "/faq", label: "FAQ", kind: "section" },
  );
  return out;
}

export async function GET(request: Request) {
  try {
    const targetsOnly = new URL(request.url).searchParams.get("targets") === "1";
    const targets = await inventory();
    if (targetsOnly) return NextResponse.json({ targets });

    const sb = supabaseAdmin();
    const [posts, pages] = await Promise.all([
      sb.from("blog_posts").select("id, slug, title, body, status, publish_at, deleted_at"),
      sb.from("pages").select("id, slug, title, content, status"),
    ]);

    const now = Date.now();
    const docs: DocumentRef[] = [
      ...(posts.data ?? []).map((p: any) => ({
        id: p.id, kind: "post" as const, title: p.title, path: `/blog/${p.slug}`, body: p.body,
        // "live" must match what the site actually shows: published, or
        // scheduled with the time already passed. See lib/data.ts.
        live: !p.deleted_at && (p.status === "published"
          || (p.status === "scheduled" && !!p.publish_at && new Date(p.publish_at).getTime() <= now)),
      })),
      ...(pages.data ?? []).map((p: any) => ({
        id: p.id, kind: "page" as const, title: p.title, path: `/${p.slug}`, body: p.content,
        live: p.status === "published",
      })),
    ];

    const report = buildLinkReport(docs, targets);
    return NextResponse.json({ report, targets });
  } catch (e) {
    return NextResponse.json({ error: `Could not check links: ${(e as Error).message}` }, { status: 500 });
  }
}
