import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import MovieCard from "@/components/MovieCard";
import MovieDetail from "@/components/MovieDetail";
import { PosterWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
import { getMovie, getMovies, trendingNow, newestSeries } from "@/lib/data";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { parseTmdbId, fetchTitle, relatedTmdb, trendingLiveTmdb, latestReleasesTmdb, tmdbConfigured, fetchSeasons, type SeasonInfo } from "@/lib/tmdb";
import { baseUrl, toIsoDuration } from "@/lib/site";
import { posterLg } from "@/lib/images";
import type { Movie } from "@/lib/types";

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ id: string }> }

/** Metadata for a page whose record could not be resolved.
 *
 *  NOTE (unresolved): notFound() renders the 404 view but the response still
 *  carries HTTP 200 - a soft 404. Verified locally that Next's own unmatched
 *  route 404s correctly while notFound() does not, and that a loading.tsx
 *  boundary is NOT the cause. Until the status is fixed, these directives are
 *  what stop crawlers keeping and re-fetching invented ids, which matters here
 *  because the id space is unbounded (any tmdb-* number). Check the deployed
 *  Worker before assuming it is broken in production too. */
const NOT_FOUND_META = { title: "Not found", robots: { index: false, follow: false } } as const;


/** Curated catalogue titles are prebuilt; anything else renders on demand. */
export async function generateStaticParams() {
  const movies = await getMovies();
  return movies.map((m) => ({ id: m.id }));
}
export const dynamicParams = true;
// Cached (ISR): rendered once, reused for 600s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
// Aligned with the TMDB data TTL (3 days, see lib/tmdb.ts): regenerating a
// page more often than its underlying data can change costs an R2 write and
// produces byte-identical output. Title, synopsis, cast and trailer are
// history; live availability is a client island that is never cached here.
export const revalidate = 259200;

/** Local catalogue first, then TMDB for ids like "tmdb-m-1234". */
async function resolve(id: string, movies: Movie[]): Promise<Movie | null> {
  const local = movies.find((m) => m.id === id);
  if (local) return local;
  // getMovie checks the database row AND the built-in catalogue snapshot —
  // without this, a curated id missing from the DB (rows deleted, table
  // reseeded, etc.) 404s even though the id exists in the shipped JSON.
  const catalogued = await getMovie(id);
  if (catalogued) return catalogued;
  const parsed = parseTmdbId(id);
  return parsed ? fetchTitle(parsed.kind, parsed.id) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const movies = await getMovies();
  const m = await resolve(id, movies);
  if (!m) return NOT_FOUND_META;
  // "Cast, Trailer & Where to Watch" targets the exact long-tail phrasing
  // people actually type into Google for a specific title, instead of just
  // the bare movie name (which ranks against IMDb/Wikipedia and every other
  // big site — long-tail intent phrases are the gap a small new site can
  // actually win).
  const title = `${m.title} (${m.year}) — Cast, Trailer & Where to Watch`;
  // Intent phrase FIRST, then synopsis, capped at snippet length — Google
  // truncates ~160 chars, so the old 300-char version buried the call to
  // action past the ellipsis.
  const description = `Watch ${m.title} (${m.year}) — trailer, cast, ratings & where to stream. ${m.desc}`.slice(0, 158);
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

  // ONE URL PER TITLE. The id parser accepts any trailing slug, so
  // /movie/tmdb-m-1061474, /movie/tmdb-m-1061474-superman and
  // /movie/tmdb-m-1061474-anything-at-all all resolved to the same film with
  // a 200. That is duplicate content for Google, and worse for us: each
  // variant was its own cache object, so anyone could mint unlimited cache
  // inventory for a single movie. A canonical tag alone does not stop that -
  // this sends non-canonical variants to the real URL permanently, which also
  // consolidates any ranking the older bare-id links picked up.
  if (m.id !== id) permanentRedirect(`/movie/${m.id}`);

  // Related: genuine TMDB recommendations for fetched titles. "Featured" is a
  // live trending/latest fill-in either way, falling back to the local
  // catalogue only if TMDB is unreachable/unconfigured.
  const parsed = parseTmdbId(m.id);
  // Seasons kick off in parallel with the related/featured fetches below —
  // they were previously awaited after them, adding a full extra network
  // round-trip to every series page's TTFB. try/catch inside the promise
  // so a TMDB hiccup degrades to "no picker", never a 500.
  const seasonsPromise: Promise<SeasonInfo[]> =
    m.kind === "series" && m.tmdbId != null && tmdbConfigured
      ? fetchSeasons(m.tmdbId).catch(() => [])
      : Promise.resolve([]);

  let related: Movie[];
  let featured: Movie[];
  if (parsed) {
    const recs = await relatedTmdb(parsed.kind, parsed.id, 8);
    related = recs.slice(0, 4);
    featured = recs.slice(4, 8).length ? recs.slice(4, 8) : await latestReleasesTmdb("series", 4);
  } else {
    const [liveRelated, liveFeatured] = await Promise.all([
      tmdbConfigured ? trendingLiveTmdb("all", 8) : Promise.resolve([] as Movie[]),
      tmdbConfigured ? latestReleasesTmdb("series", 8) : Promise.resolve([] as Movie[]),
    ]);
    related = (liveRelated.length ? liveRelated : trendingNow(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
    featured = (liveFeatured.length ? liveFeatured : newestSeries(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
  }
  if (!featured.length) featured = newestSeries(movies, 4).filter((x) => x.id !== m.id);

  // Below-detail suggestions: related first, featured as filler, no dupes.
  const suggestions = [...related, ...featured]
    .filter((x, i, arr) => x.id !== m.id && arr.findIndex((y) => y.id === x.id) === i)
    .slice(0, 6);

  const seasons = await seasonsPromise;

  // Structured data (schema.org/Movie) — this is what makes Google eligible
  // to show a "Rich Result" card (poster thumbnail + star rating right in
  // the search listing) instead of a plain blue link. Costs nothing, no
  // account needed, just needs to be valid JSON-LD in the page <head>/body.
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: m.kind === "series" ? "TV Shows" : "Movies", path: m.kind === "series" ? "/tv-shows" : "/movies" },
    { name: m.title },
  ]);

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
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />
      <div className="pagerow">
        <div className="pagemain">
          <MovieDetail movie={m} seasons={seasons} suggestions={suggestions} />
        </div>
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
