import Link from "next/link";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import ChannelCardRich from "@/components/ChannelCardRich";
import ClassicsRow from "@/components/ClassicsRow";
import BlogSection from "@/components/BlogSection";
import NewSinceLastVisit from "@/components/NewSinceLastVisit";
import MoodRoulette from "@/components/MoodRoulette";
import { PosterWidget, GenresWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, getSiteConfig, resolveRow, byIds, trendingNow, topRated } from "@/lib/data";
import { CHANNELS } from "@/lib/channels";

/** Only the platforms most of our audience actually subscribes to get the
 *  rich card on the homepage. Each rich card makes its own TMDB call for
 *  its poster fan, so rendering all 17 cost 17 API calls, 17 cached
 *  objects and a wall of near-identical cards per homepage render. The
 *  full list stays one click away on the channel pages and in the footer. */
const HOME_CHANNELS = CHANNELS.slice(0, 8);
import {
  latestReleasesTmdb, trendingLiveTmdb, topRatedTmdb, hollywoodTmdb, bollywoodTmdb,
  koreanTmdb, chineseTmdb, animeTmdb, teluguTmdb, tmdbConfigured, languageRowTmdb, anticipatedTmdb,
} from "@/lib/tmdb";
import { toCard, toBigCard, type Movie, type RowConfig } from "@/lib/types";

// Cached (ISR): rendered once, reused for 300s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 900;

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
  // server-side — see lib/tmdb.ts `get()` — so steady-state renders hit
  // TMDB rarely). Sections whose fetch comes back empty simply don't
  // render, so a TMDB hiccup degrades to a shorter page, never a broken one.
  const [
    top10Movies, top10Shows,
    bollywoodMovies, teluguMovies,
    indianSerials, anticipated,
    railTrending, railTop,
  ] = await Promise.all([
    live ? trendingLiveTmdb("movie", 8) : noMovies,
    live ? trendingLiveTmdb("series", 8) : noMovies,
    // Audience-language rows: what South Asian viewers actually search for.
    live ? languageRowTmdb("movie", "hi", 8) : noMovies,
    live ? languageRowTmdb("movie", "te", 8) : noMovies,
    live ? languageRowTmdb("series", "hi", 8, "IN") : noMovies,
    live ? anticipatedTmdb(8) : noMovies,
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
        <MovieCard key={m.id} movie={toCard(m)} rank={opts.ranked ? i + 1 : undefined} badge={opts.badge} />
      ))}
    </Row>
  );

  return (
    <div className="page">
      <NewSinceLastVisit ids={latestIds} titles={latestTitles} />
      <Hero slides={byIds(site.hero.slides, movies).map(toBigCard)} intervalMs={site.hero.intervalMs ?? 6000} />
      <div className="pagerow">
        <div className="pagemain">
          {/* Slim projection, not the full catalogue: this is a client
              component, so every field handed to it is serialized into the
              homepage HTML for every visitor to download. */}
          <MoodRoulette movies={movies.map((m) => ({
            id: m.id, title: m.title, year: m.year, genres: m.genres,
            rating: m.rating, desc: m.desc, posterPath: m.posterPath,
          }))} />

          {/* 1 · Channels — the old Editor's Picks slot (same wide-card
                rail), now selling platforms instead of individual titles. */}
          {/* Every channel renders the rich card (logo + live top-4 poster
                fan); ChannelCardRich itself falls back to the gradient card
                for channels without a logo or live data, so the rail always
                looks complete. */}
          <Row title="Popular" sub="Movie channels — pick a platform, see what's streaming on it">
            {HOME_CHANNELS.map((c) => <ChannelCardRich key={c.slug} channel={c} />)}
          </Row>

          {/* 2–3 · Editor-curated: newest catalogue additions, by created-at
                (never auto-updates — only changes when the editor adds titles). */}

          {/* 4–8 · Live movie blocks. */}
          {rail("top10-movies", "Top 10 Movies in the World Today", "The most-watched movies across the globe, updated daily", top10Movies.slice(0, 8), { ranked: true, all: allTrending })}
          {/* Big films still ahead: Avengers Doomsday and whatever else the
              world is most excited about, straight from TMDB popularity for
              future release dates - no hardcoded list to go stale. */}
          {rail("anticipated", "Most Anticipated Movies", "The biggest films still to come, ranked by what the world is watching for", anticipated)}

          {/* Audience language rows are woven through the page instead of
              stacked at the end: Bollywood right after the Top 10, Telugu
              and Tamil between the global movie rows, the serial and drama
              rows inside the TV block, anime closing it. */}
          {rail("bollywood", "Bollywood Movies", "The biggest Hindi films everyone is watching right now", bollywoodMovies)}

          {/* 5 · Upcoming keeps the wide "editor's pick" card style. */}

          {rail("telugu", "Telugu Movies", "Tollywood blockbusters and pan India hits", teluguMovies)}

          {/* 9–12 · Live TV blocks. */}
          {rail("top10-shows", "Top 10 TV Shows in the World Today", "The most-watched shows across the globe, updated daily", top10Shows.slice(0, 8), { ranked: true, all: allShows })}
          {rail("indian-serials", "Indian Drama Serials", "Popular Hindi serials and shows from Indian television", indianSerials, { all: allShows })}

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
                    movie={toCard(m)}
                    rank={row.style === "ranked" ? i + 1 : undefined}
                    badge={row.style === "badge" ? (row.badge ?? "NEW") : undefined}
                  />
                ))}
              </Row>
            );
          })}

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
