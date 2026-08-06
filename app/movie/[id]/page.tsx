import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MovieDetail from "@/components/MovieDetail";
import { PosterWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, trendingNow, newestSeries } from "@/lib/data";
import { parseTmdbId, fetchTitle, relatedTmdb, trendingLiveTmdb, latestReleasesTmdb, tmdbConfigured } from "@/lib/tmdb";
import type { Movie } from "@/lib/types";

interface Params { params: { id: string } }

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
  const movies = await getMovies();
  const m = await resolve(params.id, movies);
  if (!m) return { title: "Not found" };
  return { title: m.title, description: m.desc, openGraph: { title: m.title, description: m.desc, type: "video.movie" } };
}

export default async function MoviePage({ params }: Params) {
  const movies = await getMovies();
  const m = await resolve(params.id, movies);
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

  return (
    <div className="page">
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
