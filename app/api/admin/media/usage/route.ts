import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * /api/admin/media/usage — which uploaded images are actually used, and where.
 *
 * READ ONLY. GET and nothing else — deleting stays on the media route, behind
 * its own confirmation, so an audit of what is unused can never itself delete
 * something.
 *
 * HOW "UNUSED" IS DECIDED, and why it errs toward keeping files:
 *
 * Every place an image URL can end up is scanned — blog featured images AND
 * blog bodies (a picture inserted mid-article is a real use), page content,
 * catalogue posters and backdrops, free-movie artwork, and the homepage /
 * discovery configs. A file counts as used if its URL appears in ANY of them.
 *
 * Matching is on the file PATH, not the whole URL, because the same file can
 * be referenced through slightly different URLs (with or without a query
 * string, through a different Supabase host alias). Matching the whole string
 * would report a file as unused while a page is still showing it — and this
 * report exists to help delete things, so a false "unused" is the one answer
 * that could destroy something.
 * ========================================================================= */

/** The identifying part of a storage URL: everything after the bucket, minus
 *  any query string. Two URLs pointing at the same object share it. */
function fileKey(url: string): string {
  try {
    const path = url.split("?")[0];
    const i = path.lastIndexOf("/");
    return (i === -1 ? path : path.slice(i + 1)).toLowerCase();
  } catch { return url.toLowerCase(); }
}

export async function GET() {
  try {
    const admin = supabaseAdmin();

    const { data: mediaRows, error } = await admin
      .from("media").select("id, name, url, size, mime_type, created_at").limit(5000);
    if (error) throw error;
    const media = (mediaRows ?? []) as { id: string; name: string; url: string; size: number | null; mime_type: string | null; created_at: string }[];

    /* ---- collect every string that could contain an image URL ---- */
    const haystack: { text: string; where: string }[] = [];
    const push = (v: unknown, where: string) => {
      if (typeof v === "string" && v) haystack.push({ text: v, where });
      else if (Array.isArray(v)) haystack.push({ text: v.join(" "), where });
      else if (v && typeof v === "object") haystack.push({ text: JSON.stringify(v), where });
    };

    const grab = async (table: string, cols: string, where: string, fields: string[]) => {
      try {
        const { data } = await admin.from(table).select(cols).limit(2000);
        for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
          for (const f of fields) push(row[f], where);
        }
      } catch { /* optional table / column */ }
    };

    await Promise.all([
      grab("blog_posts", "image_url, body, title", "Blog Posts", ["image_url", "body"]),
      grab("pages", "content", "Pages", ["content"]),
      grab("movies", "poster_url, backdrop_url", "Movies & Series", ["poster_url", "backdrop_url"]),
      grab("classics", "poster_url, backdrop_url", "Free Movies", ["poster_url", "backdrop_url"]),
      grab("homepage_config", "live_config, draft_config", "Homepage", ["live_config", "draft_config"]),
      grab("discovery_config", "live_config, draft_config", "Discovery", ["live_config", "draft_config"]),
      grab("site_settings", "*", "Settings", ["logo_url", "social"]),
    ]);

    /* ---- match by file key ---- */
    const usedBy = new Map<string, Set<string>>();
    for (const m of media) {
      const key = fileKey(m.url);
      if (!key) continue;
      for (const h of haystack) {
        if (h.text.toLowerCase().includes(key)) {
          if (!usedBy.has(m.id)) usedBy.set(m.id, new Set());
          usedBy.get(m.id)!.add(h.where);
        }
      }
    }

    const items = media.map((m) => ({
      ...m,
      usedIn: [...(usedBy.get(m.id) ?? [])].sort(),
      used: (usedBy.get(m.id)?.size ?? 0) > 0,
    }));

    const unused = items.filter((i) => !i.used);
    const totalBytes = items.reduce((s, i) => s + (i.size ?? 0), 0);
    const unusedBytes = unused.reduce((s, i) => s + (i.size ?? 0), 0);

    return NextResponse.json({
      items,
      totals: {
        files: items.length,
        bytes: totalBytes,
        unusedFiles: unused.length,
        unusedBytes,
        scanned: haystack.length,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not check media usage: ${(e as Error).message}` }, { status: 500 });
  }
}
