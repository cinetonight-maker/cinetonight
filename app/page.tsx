import Link from "next/link";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import BigCard from "@/components/BigCard";
import ChannelCardRich from "@/components/ChannelCardRich";
import ClassicsRow from "@/components/ClassicsRow";
import BlogSection from "@/components/BlogSection";
import NewSinceLastVisit from "@/components/NewSinceLastVisit";
import MoodRoulette from "@/components/MoodRoulette";
import { PosterWidget, GenresWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, getSiteConfig, resolveRow, byIds, trendingNow, topRated, recentlyAdded } from "@/lib/data";
import { CHANNELS } from "@/lib/channels";
import {
  latestReleasesTmdb, trendingLiveTmdb, topRatedTmdb, hollywoodTmdb, bollywoodTmdb,
  koreanTmdb, chineseTmdb, animeTmdb, teluguTmdb, tmdbConfigured,
  nowPlayingTmdb, upcomingTmdb, popularListTmdb, topRatedListTmdb, onTheAirTmdb, genreRowTmdb,
} from "@/lib/tmdb";
import type { Movie, RowConfig } from "@/lib/types";

// Cached (ISR): rendered once, reused for 300s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 300;

// Homepage canonical — resolved against metadataBase; without it the most
// important URL on the site was the only indexable one lacking a canonical.
export const metadata = { alternates: { canonical: "/" } };

/** "live" rows pull from TMDB in real time — an unrestricted global mix
 *  (Hollywood + Bollywood + everything else) unless the row specifically
 *  asks for one industry. Falls back to the saved-catalogue rule if TMDB
 *  is unreachable/unconfigured or a fetch comes back empty. */
async function itemsFor(row: RowConfig, movies: Movie[]): Promise<Movie[]> {
  if (row.mode === "live" && tmdbConfigured) {
    const kind = row.rule?.kind ?? "all";
    const limit = row.rule?.limit ?? 6;
    const live = await (row.live === "latest" ? latestReleasesTmdb(kind, limit)
      : row.live === "toprated" ? topRatedTmdb(kind, limit)
      : row.live === "hollywood" ? hollywoodTmdb(kind, limit)
      : row.live === "bollywood" ? bollywoodTmdb(kind, limit)
      : row.live === "korean" ? koreanTmdb(kind, limit)
      : row.live === "chinese" ? chineseTmdb(kind, limit)
      : row.live === "anime" ? animeTmdb(kind, limit)
      : row.live === "telugu" ? teluguTmdb(kind, limit)
      : trendingLiveTmdb(kind, limit));
    if (live.length) return live;
  }
  return resolveRow(row, movies);
}

const noMovies = Promise.resolve([] as Movie[]);

export default async function HomePage() {
  const [movies, site] = await Promise.all([getMovies(), getSiteConfig()]);
  const live = tmdbConfigured;

  // Every live section fetched in ONE parallel wave (each call is cached
  // 6h server-side — see lib/tmdb.ts `get()` — so steady-state renders hit
  // TMDB rarely). Sections whose fetch comes back empty simply don't
  // render, so a TMDB hiccup degrades to a shorter page, never a broken one.
  const [
    recentMovies, recentShows,
    nowShowing, top10Movies, upcoming, popularMovies, topRatedMovies,
    onAir, top10Shows,
    thrillerMovies, actionMovies, topRatedShows, popularShows,
    animationMovies, kidsShows, crimeShows, westernShows,
    railTrending, railTop,
  ] = await Promise.all([
    recentlyAdded("movie", 8), recentlyAdded("series", 8),
    live ? nowPlayingTmdb(10) : noMovies,
    live ? trendingLiveTmdb("movie", 10) : noMovies,
    live ? upcomingTmdb(8) : noMovies,
    live ? popularListTmdb("movie", 10) : noMovies,
    live ? topRatedListTmdb("movie", 10) : noMovies,
    live ? onTheAirTmdb(10) : noMovies,
    live ? trendingLiveTmdb("series", 10) : noMovies,
    live ? genreRowTmdb("movie", "Thriller", 10) : noMovies,
    live ? genreRowTmdb("movie", "Action", 10) : noMovies,
    live ? topRatedListTmdb("series", 10) : noMovies,
    live ? popularListTmdb("series", 10) : noMovies,
    live ? genreRowTmdb("movie", "Animation", 10) : noMovies,
    live ? genreRowTmdb("series", "Kids", 10) : noMovies,
    live ? genreRowTmdb("series", "Crime", 10) : noMovies,
    live ? genreRowTmdb("series", "Western", 10) : noMovies,
    live ? trendingLiveTmdb("all", 4) : noMovies,
    live ? topRatedTmdb("all", 4) : noMovies,
  ]);
  // Dashboard-managed rows resolve in the SAME wave conceptually — they
  // were previously awaited after the block above, serializing two whole
  // network waves and inflating TTFB. (Kept as a second statement for
  // readability, but the heavy TMDB calls above are already settled, and
  // each row here runs concurrently.)
  const allRows = await Promise.all(site.rows.map(async (row) => ({ row, items: await itemsFor(row, movies) })));
  // The configured "top" row duplicates the new "Top Rated Movies" (all
  // time) section — skip it rather than showing near-identical rails.
  const rows = allRows.filter(({ row }) => row.id !== "top");

  // Top-of-catalogue slice (already newest-first — see getMovies()'s
  // order-by-year query) used purely as a "what's new" fingerprint for
  // NewSinceLastVisit below; nothing else on the page depends on this.
  const latestIds = movies.slice(0, 12).map((m) => m.id);
  const latestTitles = Object.fromEntries(movies.slice(0, 12).map((m) => [m.id, m.title]));

  const allMovies = <Link className="sec__all" href="/movies">View All</Link>;
  const allShows = <Link className="sec__all" href="/tv-shows">View All</Link>;
  const allTrending = <Link className="sec__all" href="/trending">View All</Link>;

  /** Plain rail of MovieCards — the workhorse for most sections below. */
  const rail = (
    key: string, title: string, sub: string, items: Movie[],
    opts: { ranked?: boolean; badge?: string; all?: React.ReactNode } = {},
  ) => items.length > 0 && (
    <Row key={key} title={title} sub={sub} all={opts.all ?? allMovies}>
      {items.map((m, i) => (
        <MovieCard key={m.id} movie={m} rank={opts.ranked ? i + 1 : undefined} badge={opts.badge} />
      ))}
    </Row>
  );

  return (
    <div className="page">
      <NewSinceLastVisit ids={latestIds} titles={latestTitles} />
      <Hero slides={byIds(site.hero.slides, movies)} intervalMs={site.hero.intervalMs ?? 6000} />
      <div className="pagerow">
        <div className="pagemain">
          <MoodRoulette movies={movies} />

          {/* 1 · Channels — the old Editor's Picks slot (same wide-card
                rail), now selling platforms instead of individual titles. */}
          {/* Every channel renders the rich card (logo + live top-4 poster
                fan); ChannelCardRich itself falls back to the gradient card
                for channels without a logo or live data, so the rail always
                looks complete. */}
          <Row title="Popular" sub="Movie channels — pick a platform, see what's streaming on it">
            {CHANNELS.map((c) => <ChannelCardRich key={c.slug} channel={c} />)}
          </Row>

          {/* 2–3 · Editor-curated: newest catalogue additions, by created-at
                (never auto-updates — only changes when the editor adds titles). */}
          {rail("recent-movies", "Recently Added Movies", "Fresh movies hand-picked and added by our editors", recentMovies, { badge: "NEW" })}
          {rail("recent-shows", "Recently Added Shows", "The latest web series & TV shows added by our editors", recentShows, { badge: "NEW", all: allShows })}

          {/* 4–8 · Live movie blocks. */}
          {rail("now-showing", "Now Showing", "Movies playing in theatres right now", nowShowing)}
          {rail("top10-movies", "Top 10 Movies in the World Today", "The most-watched movies across the globe, updated daily", top10Movies.slice(0, 10), { ranked: true, all: allTrending })}

          {/* 5 · Upcoming keeps the wide "editor's pick" card style. */}
          {upcoming.length > 0 && (
            <Row title="Upcoming" sub="Upcoming movies hitting theatres soon — watch the trailers first" all={allMovies}>
              {upcoming.map((m) => <BigCard key={m.id} movie={m} eyebrow="Coming Soon" />)}
            </Row>
          )}

          {rail("popular-movies", "Popular Movies", "Popular movies streaming now, straight from the global charts", popularMovies)}
          {rail("toprated-movies", "Top Rated Movies", "The highest-rated movies of all time", topRatedMovies)}

          {/* 9–12 · Live TV blocks. */}
          {rail("on-air", "On The Air", "New episodes recently aired & airing this week", onAir, { all: allShows })}
          {rail("top10-shows", "Top 10 TV Shows in the World Today", "The most-watched shows across the globe, updated daily", top10Shows.slice(0, 10), { ranked: true, all: allShows })}
          {rail("popular-shows", "Popular TV Shows", "The shows everyone is streaming right now", popularShows, { all: allShows })}
          {rail("toprated-shows", "Top Rated TV Shows", "The highest-rated series of all time", topRatedShows, { all: allShows })}

          {/* Free Classics — the only "watch the FULL movie here" shelf on
                the site: hand-curated public-domain films (see lib/classics). */}
          <ClassicsRow />

          {/* 13+ · The dashboard-managed rows (Latest, Trending This Week,
                K-Drama, Hollywood, Bollywood, Telugu, Anime, C-Drama, …) —
                kept exactly as configured in /admin. */}
          {rows.map(({ row, items }) => {
            if (!items.length) return null;
            return (
              <Row key={row.id} title={row.title} all={allMovies}>
                {items.map((m, i) => (
                  <MovieCard
                    key={m.id}
                    movie={m}
                    rank={row.style === "ranked" ? i + 1 : undefined}
                    badge={row.style === "badge" ? (row.badge ?? "NEW") : undefined}
                  />
                ))}
              </Row>
            );
          })}

          {/* Genre deep-cuts — movies first, then TV, ending on niche
                rows so the page finishes with discovery, not repetition. */}
          {rail("thriller", "Thriller Movies", "Edge-of-your-seat thrillers trending now", thrillerMovies)}
          {rail("action", "Action Movies", "Big, loud & spectacular — the most popular action films", actionMovies)}
          {rail("animation", "Animation Movies", "Animated features for every age", animationMovies)}
          {rail("kids-tv", "Kids TV Shows", "Family-friendly shows the kids will love", kidsShows, { all: allShows })}
          {rail("crime-tv", "Crime TV Shows", "Heists, detectives & underworld drama", crimeShows, { all: allShows })}
          {rail("western-tv", "Western TV Shows", "Frontier tales & modern westerns", westernShows, { all: allShows })}
        </div>
        <aside className="pageaside">
          <PosterWidget title="Trending Now" movies={railTrending.length ? railTrending : trendingNow(movies, 4)} href="/trending" />
          <PosterWidget title="Top Rated" movies={railTop.length ? railTop : topRated(movies, 4)} href="/trending" />
          <GenresWidget />
          <NewsWidget />
        </aside>
      </div>
      <BlogSection />
    </div>
  );
}
