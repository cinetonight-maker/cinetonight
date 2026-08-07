import Link from "next/link";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import BigCard from "@/components/BigCard";
import ContinueWatching from "@/components/ContinueWatching";
import BlogSection from "@/components/BlogSection";
import { PosterWidget, GenresWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, getSiteConfig, resolveRow, byIds, trendingNow, topRated } from "@/lib/data";
import {
  latestReleasesTmdb, trendingLiveTmdb, topRatedTmdb, hollywoodTmdb, bollywoodTmdb, tmdbConfigured,
} from "@/lib/tmdb";
import type { Movie, RowConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

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
      : trendingLiveTmdb(kind, limit));
    if (live.length) return live;
  }
  return resolveRow(row, movies);
}

export default async function HomePage() {
  const ViewAll = <Link className="sec__all" href="/movies">View All</Link>;
  const [movies, site] = await Promise.all([getMovies(), getSiteConfig()]);
  const rows = await Promise.all(site.rows.map(async (row) => ({ row, items: await itemsFor(row, movies) })));
  const [railTrending, railTop] = await Promise.all([
    tmdbConfigured ? trendingLiveTmdb("all", 4) : Promise.resolve([]),
    tmdbConfigured ? topRatedTmdb("all", 4) : Promise.resolve([]),
  ]);
  return (
    <div className="page">
      <Hero slides={byIds(site.hero.slides, movies)} intervalMs={site.hero.intervalMs ?? 6000} />
      <div className="pagerow">
        <div className="pagemain">
          <ContinueWatching items={site.continueWatching} movies={movies} />

          {topRated(movies, 6).length > 0 && (
            <Row title="Editor's Picks" all={ViewAll}>
              {topRated(movies, 6).map((m) => <BigCard key={m.id} movie={m} eyebrow="Top Rated" />)}
            </Row>
          )}

          {rows.map(({ row, items }) => {
            if (!items.length) return null;
            return (
              <Row key={row.id} title={row.title} all={ViewAll}>
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
