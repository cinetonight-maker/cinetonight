import { NextResponse } from "next/server";
import { buildWatch } from "@/lib/watchRows";
import { visitorRegion } from "@/lib/region";
import { clientKey, isRateLimited } from "@/lib/rateLimit";
import type { MovieKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-visitor watch availability. Exists so movie PAGES can be cached
 *  statically while this small call carries the only per-region part.
 *  Real browsers call it; crawlers (which don't run JS) never do. */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "watch", { windowMs: 60_000, max: 120 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const u = new URL(request.url);
  const id = u.searchParams.get("id") ?? "";
  const kind = (u.searchParams.get("kind") === "series" ? "series" : "movie") as MovieKind;
  const title = (u.searchParams.get("title") ?? "").slice(0, 200);
  const tmdbId = u.searchParams.get("tmdbId");
  if (!id && !tmdbId) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const region = await visitorRegion();
  const payload = await buildWatch(id, tmdbId, kind, title, region);
  const res = NextResponse.json(payload);
  // Browser-private cache only: the response is region-personal.
  res.headers.set("Cache-Control", "private, max-age=1800");
  return res;
}
