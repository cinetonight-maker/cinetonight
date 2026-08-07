import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MovieDetail from "@/components/MovieDetail";
import { PosterWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, trendingNow, newestSeries } from "@/lib/data";
import { parseTmdbId, fetchTitle, relatedTmdb, trendingLiveTmdb, latestReleasesTmdb, tmdbConfigured } from "@/lib/tmdb";
import { baseUrl, toIsoDuration } from "@/lib/site";
import { posterLg } from "@/lib/images";
import type { Movie } from "@/lib/types";

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ id: string }> }

/** Curated catalogue titles are prebuilt; anything else renders on demand. */
export async function generateStaticParams() {
  const movies = await getMovies();
  return movies.map((m) => ({ id: m.id }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

/** Local catalogue first, then TMDB for ids like "tmdb-m-1234". */
async function resolve(id: string, movies: Movie[]): Promise<Movie | null> {
  const local = movies.find((m) => m.id === id);
  if (local) return local;
  const parsed = parseTmdbId(id);
  return parsed ? fetchTitle(parsed.kind, parsed.id) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const movies = await getMovies();
  const m = await resolve(id, movies);
  if (!m) return { title: "Not found" };
  // "Cast, Trailer & Where to Watch" targets the exact long-tail phrasing
  // people actually type into Google for a specific title, instead of just
  // the bare movie name (which ranks against IMDb/Wikipedia and every other
  // big site — long-tail intent phrases are the gap a small new site can
  // actually win).
  const title = `${m.title} (${m.year}) — Cast, Trailer & Where to Watch`;
  const description = `${m.desc} Watch ${m.title} (${m.year}): full cast & crew, trailer, ratings, and where to stream it online.`.slice(0, 300);
  const image = posterLg(m);
  const url = `${baseUrl()}/movie/${m.id}`;
  return {
    title,
    description,
    // Per-page `alternates` fully replaces the root layout's (which is
    // where the RSS autodiscovery link normally lives), so it has to be
    // repeated here or this page would silently lose it.
    alternates: { canonical: url, types: { "application/rss+xml": "/rss.xml" } },
    openGraph: { title, description, type: "video.movie", url, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function MoviePage({ params }: Params) {
  const { id } = await params;
  const movies = await getMovies();
  const m = await resolve(id, movies);
  if (!m) notFound();

  // Related: genuine TMDB recommendations for fetched titles. "Featured" is a
  // live trending/latest fill-in either way, falling back to the local
  // catalogue only if TMDB is unreachable/unconfigured.
  const parsed = parseTmdbId(m.id);
  let related: Movie[];
  let featured: Movie[];
  if (parsed) {
    const recs = await relatedTmdb(parsed.kind, parsed.id, 8);
    related = recs.slice(0, 4);
    featured = recs.slice(4, 8).length ? recs.slice(4, 8) : await latestReleasesTmdb("series", 4);
  } else {
    const liveRelated = tmdbConfigured ? await trendingLiveTmdb("all", 8) : [];
    related = (liveRelated.length ? liveRelated : trendingNow(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
    const liveFeatured = tmdbConfigured ? await latestReleasesTmdb("series", 8) : [];
    featured = (liveFeatured.length ? liveFeatured : newestSeries(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
  }
  if (!featured.length) featured = newestSeries(movies, 4).filter((x) => x.id !== m.id);

  // Structured data (schema.org/Movie) — this is what makes Google eligible
  // to show a "Rich Result" card (poster thumbnail + star rating right in
  // the search listing) instead of a plain blue link. Costs nothing, no
  // account needed, just needs to be valid JSON-LD in the page <head>/body.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: m.title,
    image: posterLg(m),
    description: m.desc,
    url: `${baseUrl()}/movie/${m.id}`,
    datePublished: String(m.year),
    genre: m.genres,
    inLanguage: m.language || undefined,
    contentRating: m.cert || undefined,
    duration: toIsoDuration(m.runtime),
    director: m.director
      ? m.director.split(",").map((name) => ({ "@type": "Person", name: name.trim() })).filter((p) => p.name)
      : undefined,
    actor: m.cast?.length
      ? m.cast.slice(0, 10).map((c) => ({ "@type": "Person", name: c.name }))
      : undefined,
    aggregateRating: m.rating
      ? { "@type": "AggregateRating", ratingValue: m.rating, bestRating: 10, ratingCount: m.votes || 1 }
      : undefined,
  };

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD we built above, not user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <div className="pagerow">
        <div className="pagemain"><MovieDetail movie={m} /></div>
        <aside className="pageaside">
          {related.length > 0 && <PosterWidget title="Related Movies" movies={related} href="/trending" />}
          {featured.length > 0 && <PosterWidget title="Featured" movies={featured} href="/web-series" />}
          <BlogWidget />
          <NewsWidget />
        </aside>
      </div>
    </div>
  );
}
