import { NextResponse } from "next/server";
import { getMovie } from "@/lib/data";
import { parseTmdbId, fetchTitle, tmdbConfigured } from "@/lib/tmdb";
import { clientKey, isRateLimited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: resolve any title id (curated OR live tmdb-m/t slug) to card
 *  data. Exists for the watchlist: visitors save live-TMDB titles whose
 *  details aren't in the curated catalogue, so /my-list resolves the
 *  missing ones here client-side. Response is card-sized, cacheable, and
 *  rate limited like the other public endpoints. */
export async function GET(request: Request) {
  if (isRateLimited(clientKey(request), "title", { windowMs: 60_000, max: 120 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id || id.length > 200) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  try {
    const curated = await getMovie(id);
    if (curated) return cardJson(curated);

    const parsed = parseTmdbId(id);
    if (parsed && tmdbConfigured) {
      const live = await fetchTitle(parsed.kind, parsed.id);
      if (live) return cardJson({ ...live, id });
    }
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }
}

function cardJson(m: any) {
  const res = NextResponse.json({
    movie: {
      id: m.id, title: m.title, year: m.year, genres: m.genres ?? [], kind: m.kind,
      rating: m.rating ?? 0, runtime: m.runtime ?? "", cert: m.cert ?? "",
      language: m.language ?? "", desc: m.desc ?? "", cast: [], director: "", writers: "",
      posterPath: m.posterPath ?? null, backdropPath: m.backdropPath ?? null,
    },
  });
  res.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return res;
}
