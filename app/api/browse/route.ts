import { NextResponse } from "next/server";
import { getBrowsePage } from "@/lib/browse";
import type { BrowseSort } from "@/lib/tmdb";
import { toCard, type MovieKind } from "@/lib/types";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS: BrowseSort[] = ["trending", "rating", "year", "az"];

// Same rationale as /api/search — generous enough for normal filter/sort/
// page clicks, bounded against a scripted flood on the TMDB-backed route.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

/** GET /api/browse?kind=movie|series|all&sort=trending|rating|year|az&genre=Action&page=1
 *  Real, paginated, globally-mixed TMDB results — falls back to the local
 *  catalogue (also paginated) if TMDB isn't reachable/configured. Powers
 *  client-side filter/sort/page changes on listing pages AFTER the initial
 *  load; the first page's worth of results is now rendered server-side by
 *  ListingPage.tsx directly (see lib/browse.ts), so this route is no longer
 *  the only place that can produce results. */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "browse", { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind") ?? "all";
  const kind: MovieKind | "all" = kindParam === "movie" || kindParam === "series" ? kindParam : "all";
  const sortParam = url.searchParams.get("sort") ?? "trending";
  const sort: BrowseSort = (SORTS as string[]).includes(sortParam) ? (sortParam as BrowseSort) : "trending";
  const genre = url.searchParams.get("genre") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);

  const data = await getBrowsePage({ kind, sort, genre, page });
  // Card fields only: <Listing> renders posters and one meta line, so
  // returning full Movie objects sent every title's cast array and a
  // half-dozen unused fields over the wire on every filter or page click.
  // Edge-cacheable: page is clamped to MAX_BROWSE_PAGE and genre resolves
  // against a fixed map, so the meaningful URL space is small. Repeat tab
  // clicks and pagination across all visitors hit Cloudflare's edge, not the
  // Worker. Success responses only.
  const res = NextResponse.json({ ...data, results: data.results.map(toCard) });
  res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res;
}
