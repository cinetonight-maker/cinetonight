import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import MovieCard from "@/components/MovieCard";
import MovieDetail from "@/components/MovieDetail";
import MovieDetailV2 from "@/components/v2/MovieDetailV2";
import { getIntel } from "@/lib/intel";
import { PosterWidget, BlogWidget, NewsWidget } from "@/components/RightRail";
import { getMovie, getMovies, trendingNow, newestSeries } from "@/lib/data";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";
import { parseTmdbId, fetchTitle, relatedTmdb, trendingLiveTmdb, latestReleasesTmdb, tmdbConfigured, fetchSeasons, fetchSeriesFacts, preferCurated, type SeasonInfo, type SeriesFacts } from "@/lib/tmdb";
import { baseUrl, toIsoDuration } from "@/lib/site";
import { buildWatch } from "@/lib/watchRows";
import { metaDescription } from "@/lib/metaDesc";
import { posterLg } from "@/lib/images";
import { validYear, displayCert, displayPeople, releaseStatus, rankByWeightedRating } from "@/lib/quality";
import type { Movie } from "@/lib/types";
import { shouldCacheTitle } from "@/lib/cacheEligibility";

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

/* WHERE-TO-WATCH IN THE CACHED HTML.
 *
 * The panel is a client island so each visitor gets their OWN country. That
 * is right for humans and wrong for crawlers: /api/watch is robots-disallowed
 * (deliberately - it is force-dynamic and calls TMDB), so Googlebot renders
 * the page, cannot make the call, and indexes "Checking availability in your
 * country...". Every movie page therefore promised "Where to Watch" in its
 * title and delivered a spinner in its body.
 *
 * Fix: render ONE fixed region into the cached HTML as the island's initial
 * state. The browser still swaps in the visitor's real country on load.
 *
 * MUST NOT be visitorRegion(). That reads headers(), which would make this
 * route dynamic and destroy the ISR caching this whole phase exists to
 * protect - straight back to the R2 bill. A constant keeps the page static.
 *
 * US, not IN: TMDB's provider coverage is densest there and Googlebot crawls
 * predominantly from the US. buildWatch already falls back US -> IN -> GB ->
 * any country with data, so a title missing from the US still renders rows,
 * labelled with the country they actually came from. */
const SSR_WATCH_REGION = "US";

/** Build-time template switch, same flag as the theme (app/v2-theme.css):
 *  both templates ship in code, exactly one renders per build. Never
 *  per-visitor — this route's ISR must keep caching a single variant. */
const V2_TEMPLATE = process.env.NEXT_PUBLIC_V2_THEME === "1";

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
  if (!parsed) return null;
  // A curated title is ALSO reachable by its raw tmdb-{m|t}-{id}-{slug} form
  // (e.g. /movie/tmdb-m-1368337-the-odyssey for a title we've curated at
  // /movie/the-odyssey). Without this check, fetchTitle() below builds a
  // FRESH Movie straight from TMDB whose own .id happens to equal the
  // requested id (tmdbId() derives the same slug), so the permanentRedirect()
  // in the page component below never fires — the title ends up served at
  // two independent, self-canonical URLs instead of one. Cross-check the
  // curated catalogue by tmdbId + kind first so this collapses onto the
  // existing redirect instead of needing a new mechanism.
  const numericId = Number(parsed.id);
  const curated = movies.find((m) => m.tmdbId === numericId && m.kind === parsed.kind);
  if (curated) return curated;
  // FIX (4 Sep 2026 - static/dynamic runtime crash): this fetchTitle() call
  // is marked noStore, and resolve() is called from generateMetadata() (which
  // runs before the page body's own `shouldCacheTitle` + connection() gate
  // below). Without opting into dynamic rendering HERE, generateMetadata()
  // performs a no-store fetch on a route Next.js still believes is static
  // (this route has revalidate + generateStaticParams), which Next.js does
  // not allow and throws "Page changed from static to dynamic at runtime"
  // for - taking down every uncurated /movie/[id] page. Calling connection()
  // right before the fetch it's paired with fixes this for both call sites
  // (generateMetadata and the page body) without touching curated titles,
  // which all return earlier above and never reach this line. Does not
  // replace or duplicate the shouldCacheTitle gate further down - that logic
  // is untouched.
  await connection();
  return fetchTitle(parsed.kind, parsed.id, { noStore: true });
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
  // Phase 2: year 0 must never reach a <title> tag; upcoming titles say so
  // honestly instead of implying the film is watchable today.
  const yearTag = validYear(m.year) ? ` (${m.year})` : "";
  const upcoming = releaseStatus(m) === "upcoming";
  const title = upcoming
    ? `${m.title}${yearTag} — Release Date, Cast & Trailer`
    : `${m.title}${yearTag} — Cast, Trailer & Where to Watch`;
  // Intent phrase FIRST, then synopsis, capped at snippet length — Google
  // truncates ~160 chars, so the old 300-char version buried the call to
  // action past the ellipsis.
  const rawDescription = (upcoming
    ? `${m.title}${yearTag} — release date, trailer, cast & everything confirmed so far. ${m.desc}`
    : `Watch ${m.title}${yearTag} — trailer, cast, ratings & where to stream. ${m.desc}`);
  // Word-boundary trim, not a hard slice: the old .slice(0, 158) cut wherever
  // the 158th character landed, so pages ended mid-word ("...availabi").
  const description = metaDescription(rawDescription);
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

  // COST GUARD (added 3 Sep 2026 - see PROJECT_HANDOFF 04_CLOUDFLARE_AND_COST_HISTORY.md
  // and lib/cacheEligibility.ts for the threshold and its reasoning). A
  // crawler can mint unlimited R2 writes just by requesting movie ids that
  // exist on TMDB but that nobody curated or engaged with - this route's ISR
  // cache (see `revalidate` above) then writes each one to R2 permanently,
  // even if it is never requested again before the R2 object expires. Below
  // the bar the page still renders correctly - it just renders fresh on
  // every request instead of being cached, which spends Worker CPU (deep
  // inside the free tier) instead of an R2 write (the expensive line item).
  // Never changes what is served, never a 404 - caching only.
  const isCurated = movies.some((x) => x.id === m.id);
  if (!shouldCacheTitle(m, isCurated)) await connection();

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
  const watchPromise = buildWatch(m.id, m.tmdbId, m.kind, m.title, SSR_WATCH_REGION, { longTtl: true })
    .catch(() => null);
  const seasonsPromise: Promise<SeasonInfo[]> =
    m.kind === "series" && m.tmdbId != null && tmdbConfigured
      ? fetchSeasons(m.tmdbId).catch(() => [])
      : Promise.resolve([]);
  // V2 series Commitment panel — same /tv/{id} detail the seasons call
  // reads (per-isolate memo: one request), so this is free. Films: null.
  const seriesFactsPromise: Promise<SeriesFacts | null> =
    V2_TEMPLATE && m.kind === "series" && m.tmdbId != null && tmdbConfigured
      ? fetchSeriesFacts(m.tmdbId).catch(() => null)
      : Promise.resolve(null);

  // STAB-03 follow-up: every list below is live TMDB data, so before it
  // becomes a card/link on this page it's passed through preferCurated() -
  // a title you've already added to the catalogue always shows and links
  // via its own clean address here, never a fresh tmdb-* one.
  /* ---------------------------------------------------------------------
   * "More Like This" — relevance first, and nothing that isn't.
   *
   * WHAT WAS WRONG: this decided whether it could ask TMDB for real
   * recommendations by looking at the SLUG. A tmdb-* slug carries the id,
   * so those pages got genuine recommendations. A curated title's slug is
   * clean ("spider-man-brand-new-day") and carries no id, so the code
   * concluded it had none and fell back to "what's trending" plus "newest
   * series" — two lists with no relationship to the title being viewed.
   * The curated pages, the best ones on the site, got the worst row.
   * The id was never missing: it is stored on the record (m.tmdbId), which
   * is how the availability lookup finds this title on TMDB already.
   *
   * WHAT IT DOES NOW: asks for this title's own recommendations, using the
   * id from wherever it actually lives. If those run short, it tops up from
   * OUR catalogue with titles that share a genre — related on a stated,
   * checkable basis, and links to our own pages. It never tops up with
   * trending or newest, because "popular right now" is not "like this one".
   * Nothing left to show means the row and the sidebar's alternative pick
   * both hide (both are gated on suggestions.length), which is the honest
   * outcome — the old filler is exactly what made the sidebar present a
   * trending title as a carefully matched alternative.
   * ------------------------------------------------------------------ */
  const recId = parsed?.id ?? (m.tmdbId != null ? String(m.tmdbId) : null);
  const recommended = recId && tmdbConfigured
    ? preferCurated(await relatedTmdb(m.kind, recId, 16), movies).filter((x) => x.id !== m.id)
    : [];

  // Local top-up, only when the real recommendations are thin. Same kind,
  // at least one shared genre, best-rated first. No extra request - this is
  // the catalogue already in memory.
  const topUp = recommended.length >= 6 ? [] : rankByWeightedRating(
    movies.filter((x) => x.id !== m.id && x.kind === m.kind && x.genres.some((g) => m.genres.includes(g)))
  );

  const suggestions = [...recommended, ...topUp]
    .filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i)
    .slice(0, 12);

  /* The V1 template's right-rail widgets. Only V1 renders them, so only V1
   * pays for the two extra TMDB round trips they need. */
  let related: Movie[] = [];
  let featured: Movie[] = [];
  if (!V2_TEMPLATE) {
    if (parsed) {
      const recs = preferCurated(await relatedTmdb(parsed.kind, parsed.id, 8), movies);
      related = recs.slice(0, 4);
      featured = recs.slice(4, 8).length ? recs.slice(4, 8) : preferCurated(await latestReleasesTmdb("series", 4), movies);
    } else {
      const [liveRelatedRaw, liveFeaturedRaw] = await Promise.all([
        tmdbConfigured ? trendingLiveTmdb("all", 8) : Promise.resolve([] as Movie[]),
        tmdbConfigured ? latestReleasesTmdb("series", 8) : Promise.resolve([] as Movie[]),
      ]);
      const liveRelated = preferCurated(liveRelatedRaw, movies);
      const liveFeatured = preferCurated(liveFeaturedRaw, movies);
      related = (liveRelated.length ? liveRelated : trendingNow(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
      featured = (liveFeatured.length ? liveFeatured : newestSeries(movies, 8)).filter((x) => x.id !== m.id).slice(0, 4);
    }
    if (!featured.length) featured = newestSeries(movies, 4).filter((x) => x.id !== m.id);
  }

  const seasons = await seasonsPromise;
  const seriesFacts = await seriesFactsPromise;
  // Never let an availability hiccup take the page down: on failure the
  // island simply falls back to its old fetch-on-load behaviour.
  const watch = await watchPromise;

  // V2 (docs/V2-BUILD-PATH.md Phase 2): reviewed editorial intelligence for
  // this title, or null — null renders the sparse/Level-B template state.
  // Cached + stable-TTL read; failure degrades to null, never a 500. The
  // alternative title resolves through the SAME curated-first path as the
  // page itself so its link is always the canonical URL.
  const intel = V2_TEMPLATE ? await getIntel(m.id) : null;
  const altMovie = intel?.altId ? await resolve(intel.altId, movies).catch(() => null) : null;

  // Structured data (schema.org/Movie) — this is what makes Google eligible
  // to show a "Rich Result" card (poster thumbnail + star rating right in
  // the search listing) instead of a plain blue link. Costs nothing, no
  // account needed, just needs to be valid JSON-LD in the page <head>/body.
  const crumbs = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: m.kind === "series" ? "TV Shows" : "Movies", path: m.kind === "series" ? "/tv-shows" : "/movies" },
    { name: m.title },
  ]);

  // Phase 2 hygiene: series are typed TVSeries (not Movie), year 0 never
  // becomes datePublished, "NR" never becomes contentRating, a placeholder
  // "—" never becomes a Person. Upcoming titles get no datePublished at all.
  //
  // STAB-05 / STAB-06 (Pre-V2 Stabilization Backlog): this JSON-LD used to
  // carry aggregateRating (built from TMDB's rating/vote count, republished
  // as if it were CineTonight's own review aggregate — Google's guidance
  // treats an unattributed third-party rating this way as exactly the kind
  // of review-rich-result misuse manual actions target) and offers (marked
  // every Where-to-Watch row "https://schema.org/InStock", including rows
  // whose .url is a generic provider search link, e.g. a plain Google
  // search URL — an unverified search page is not a confirmed in-stock
  // offer). The backlog explicitly rules out both easy-looking fixes: "no
  // fake local ratings to keep rich-result markup" and "no guessed
  // provider deep links or availability" — so both fields are dropped
  // rather than patched. The rating number and Where-to-Watch panel still
  // render normally for human visitors; only the structured-data claims
  // are removed. Reinstate aggregateRating once there's a real local
  // rating corpus, and offers once rows carry genuine per-title deep
  // links instead of search URLs.
  const directorNames = displayPeople(m.director);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": m.kind === "series" ? "TVSeries" : "Movie",
    name: m.title,
    image: posterLg(m),
    description: m.desc,
    url: `${baseUrl()}/movie/${m.id}`,
    datePublished: releaseStatus(m) === "released" && validYear(m.year)
      ? (m.releaseDate ?? String(m.year))
      : undefined,
    genre: m.genres.filter(Boolean),
    inLanguage: m.language && m.language !== "—" ? m.language : undefined,
    contentRating: displayCert(m.cert) ?? undefined,
    duration: toIsoDuration(m.runtime),
    ...(m.kind === "series" ? {} : {
      director: directorNames
        ? directorNames.split(",").map((name) => ({ "@type": "Person", name: name.trim() }))
        : undefined,
    }),
    actor: m.cast?.length
      ? m.cast.slice(0, 10).map((c) => ({ "@type": "Person", name: c.name }))
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
      {V2_TEMPLATE ? (
        /* V2: the locked two-column template — Where to Watch beside the
           identity, decision modules data-gated on movie_intel, a Related
           Guides list + Write a Review CTA in the sidebar, guides at the
           bottom. The plain RightRail Related-Movies/Featured/Blog/News
           widgets stay retired on this route (Related already lives in
           More Like This further down; a straight blog feed is now the
           Guides section at the page bottom, plus the sidebar's own
           genre-matched list). */
        <MovieDetailV2 movie={m} seasons={seasons} suggestions={suggestions} watch={watch} intel={intel} altMovie={altMovie} seriesFacts={seriesFacts} />
      ) : (
      <div className="pagerow">
        <div className="pagemain">
          <MovieDetail movie={m} seasons={seasons} suggestions={suggestions} watch={watch} />
        </div>
        <aside className="pageaside">
          {related.length > 0 && <PosterWidget title="Related Movies" movies={related} href="/trending" />}
          {featured.length > 0 && <PosterWidget title="Featured" movies={featured} href="/web-series" />}
          <BlogWidget />
          <NewsWidget />
        </aside>
      </div>
      )}
    </div>
  );
}
