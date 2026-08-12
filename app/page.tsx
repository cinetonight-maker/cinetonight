import Link from "next/link";
import Hero from "@/components/Hero";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import BigCard from "@/components/BigCard";
import ContinueWatching from "@/components/ContinueWatching";
import BlogSection from "@/components/BlogSection";
import NewSinceLastVisit from "@/components/NewSinceLastVisit";
import MoodRoulette from "@/components/MoodRoulette";
import { PosterWidget, GenresWidget, NewsWidget } from "@/components/RightRail";
import { getMovies, getSiteConfig, resolveRow, byIds, trendingNow, topRated } from "@/lib/data";
import {
  latestReleasesTmdb, trendingLiveTmdb, topRatedTmdb, hollywoodTmdb, bollywoodTmdb,
  koreanTmdb, chineseTmdb, animeTmdb, teluguTmdb, tmdbConfigured,
  parseTmdbId, fetchTitle,
} from "@/lib/tmdb";
import { supabaseServer } from "@/lib/supabase/server";
import type { Movie, RowConfig, ContinueItem } from "@/lib/types";

export const dynamic = "force-dynamic";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

/** Real "Continue Watching" for signed-in visitors, sourced from the
 *  `recently_viewed` table each movie page writes to (see
 *  app/movie/[id]/page.tsx). Returns null for signed-out visitors or if
 *  Supabase isn't reachable, so the caller can fall back to the original
 *  admin-curated row — nobody sees an empty homepage. Ids that point at a
 *  live-TMDB title (not in the curated `movies` catalogue) get resolved
 *  individually so they still render instead of silently vanishing. */
async function getRecentlyViewed(movies: Movie[]): Promise<{ items: ContinueItem[]; extra: Movie[] } | null> {
  try {
    const supabase = await supabaseServer();
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("recently_viewed")
      .select("movie_id, viewed_at")
      .eq("user_id", user.id)
      .order("viewed_at", { ascending: false })
      .limit(8);
    if (error || !data) return null;

    const localIds = new Set(movies.map((m) => m.id));
    const missing = data.filter((r) => !localIds.has(r.movie_id as string));
    const extra = (
      await Promise.all(
        missing.map((r) => {
          const parsed = parseTmdbId(r.movie_id as string);
          return parsed ? fetchTitle(parsed.kind, parsed.id) : Promise.resolve(null);
        })
      )
    ).filter((x): x is Movie => Boolean(x));

    const items: ContinueItem[] = data.map((r) => ({
      id: r.movie_id as string,
      progress: 0,
      note: relativeTime(r.viewed_at as string),
    }));
    return { items, extra };
  } catch {
    return null;
  }
}

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

export default async function HomePage() {
  const ViewAll = <Link className="sec__all" href="/movies">View All</Link>;
  const [movies, site] = await Promise.all([getMovies(), getSiteConfig()]);
  const rows = await Promise.all(site.rows.map(async (row) => ({ row, items: await itemsFor(row, movies) })));
  const [railTrending, railTop, recentlyViewed] = await Promise.all([
    tmdbConfigured ? trendingLiveTmdb("all", 4) : Promise.resolve([]),
    tmdbConfigured ? topRatedTmdb("all", 4) : Promise.resolve([]),
    getRecentlyViewed(movies),
  ]);
  // Top-of-catalogue slice (already newest-first — see getMovies()'s
  // order-by-year query) used purely as a "what's new" fingerprint for
  // NewSinceLastVisit below; nothing else on the page depends on this.
  const latestIds = movies.slice(0, 12).map((m) => m.id);
  const latestTitles = Object.fromEntries(movies.slice(0, 12).map((m) => [m.id, m.title]));

  return (
    <div className="page">
      <NewSinceLastVisit ids={latestIds} titles={latestTitles} />
      <Hero slides={byIds(site.hero.slides, movies)} intervalMs={site.hero.intervalMs ?? 6000} />
      <div className="pagerow">
        <div className="pagemain">
          <MoodRoulette movies={movies} />

          {recentlyViewed ? (
            <ContinueWatching
              title="Continue Watching"
              items={recentlyViewed.items}
              movies={recentlyViewed.extra.length ? [...movies, ...recentlyViewed.extra] : movies}
            />
          ) : (
            <ContinueWatching items={site.continueWatching} movies={movies} />
          )}

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
