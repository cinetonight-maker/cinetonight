import { NextResponse } from "next/server";
import { hollywoodTmdb, bollywoodTmdb, koreanTmdb, southIndianTmdb, trendingLiveTmdb, tmdbConfigured } from "@/lib/tmdb";
import { discoveryFilter } from "@/lib/quality";
import { industryOf } from "@/lib/industry";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

/**
 * GET /api/explore?tab=<hollywood|bollywood|south|korean|international>
 *   → { results: Movie[] }
 *
 * Phase 3: powers the non-default Explore Tonight tabs, fetched ON
 * INTERACTION only (the default "For You" mix is server-rendered into the
 * homepage HTML and never hits this route).
 *
 * COST DESIGN — same closed-set pattern as /api/mood:
 * - `tab` is validated against exactly FIVE values; anything else is a 400
 *   before any fetch. The distinct-URL space of this route is 5.
 * - Success responses carry an edge cache header, so repeat clicks across
 *   ALL visitors hit Cloudflare's edge, not the Worker.
 * - Every pool passes Phase 2 discoveryFilter before leaving the server —
 *   Tier C cannot enter Explore.
 */
const TABS = new Set(["hollywood", "bollywood", "south", "korean", "international"]);
const LIMIT = 10;

export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "explore", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests - please slow down." }, { status: 429 });
  }
  const tab = new URL(request.url).searchParams.get("tab") ?? "";
  if (!TABS.has(tab)) {
    return NextResponse.json({ error: "Unknown tab." }, { status: 400 });
  }
  if (!tmdbConfigured) return NextResponse.json({ results: [] });

  try {
    // Over-fetch slightly so the quality filter can drop entries and still
    // fill the shelf.
    const raw =
      tab === "hollywood" ? await hollywoodTmdb("all", LIMIT + 4)
      : tab === "bollywood" ? await bollywoodTmdb("all", LIMIT + 4)
      : tab === "south" ? await southIndianTmdb("all", LIMIT + 4)
      : tab === "korean" ? await koreanTmdb("all", LIMIT + 4)
      // "International": global trending minus the industries that already
      // have their own tab — a reuse of the already-cached trending fetch,
      // not a new discovery surface.
      : (await trendingLiveTmdb("all", 20)).filter((m) => industryOf(m) === "international");

    const results = discoveryFilter(raw, 6).slice(0, LIMIT);
    const res = NextResponse.json({ results });
    res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res;
  } catch {
    return NextResponse.json({ results: [] });
  }
}
