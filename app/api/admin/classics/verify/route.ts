import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXT = /\.(mp4|mkv|avi|ogv|mpg|mpeg|m4v|webm)$/i;

/**
 * GET /api/admin/classics/verify?type=archive|youtube&id=<source id>
 * → { ok: boolean, why: string }
 *
 * Server-side version of scripts/check-classics.mjs, so the dashboard's
 * "Verify" button can confirm a source actually exists (and, for
 * archive.org, actually contains video files) before an editor publishes
 * it. Runs on the server, which — unlike the browser — isn't blocked by
 * CORS on archive.org's metadata API. Auth is enforced by the /admin
 * middleware like every other admin route.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = (url.searchParams.get("id") ?? "").trim();
  if ((type !== "archive" && type !== "youtube") || !id) {
    return NextResponse.json({ ok: false, why: "Missing/invalid type or id." }, { status: 400 });
  }

  try {
    if (type === "archive") {
      const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) return NextResponse.json({ ok: false, why: `archive.org returned ${res.status}` });
      const data = await res.json();
      if (!data?.metadata) return NextResponse.json({ ok: false, why: "Item does not exist on archive.org." });
      const hasVideo = ((data.files ?? []) as { name?: string }[]).some((f) => VIDEO_EXT.test(f.name ?? ""));
      if (!hasVideo) return NextResponse.json({ ok: false, why: "Item exists but contains no video files." });
      return NextResponse.json({ ok: true, why: `Found: "${data.metadata.title ?? id}"` });
    }
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const res = await fetch(oembed, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ ok: false, why: `YouTube returned ${res.status} — video missing or private.` });
    const data = await res.json();
    return NextResponse.json({ ok: true, why: `Found: "${data.title}"` });
  } catch (e) {
    return NextResponse.json({ ok: false, why: `Check failed: ${(e as Error).message}` });
  }
}
