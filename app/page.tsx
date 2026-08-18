import Link from "next/link";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import BlogSection from "@/components/BlogSection";
import ClassicsRow from "@/components/ClassicsRow";
import NewSinceLastVisit from "@/components/NewSinceLastVisit";
import NewsletterForm from "@/components/NewsletterForm";
import HomeHero from "@/components/home/HomeHero";
import PickStudio from "@/components/home/PickStudio";
import StreamingRow from "@/components/home/StreamingRow";
import ExploreTabs from "@/components/home/ExploreTabs";
import MyListPreview from "@/components/home/MyListPreview";
import { getMovies, getSiteConfig } from "@/lib/data";
import { trendingLiveTmdb, tmdbConfigured } from "@/lib/tmdb";
import { toCard, toPick, type Movie } from "@/lib/types";

// Cached (ISR): rendered once, reused, then refreshed in the background.
export const revalidate = 900;

// Homepage canonical - resolved against metadataBase.
export const metadata = { alternates: { canonical: "/" } };

/**
 * THE HOMEPAGE IS A DECISION ENGINE, NOT A CATALOGUE.
 *
 * Order: hero question -> quick picks -> mood -> ONE recommendation ->
 * trending -> streaming services -> explore -> guides -> my list -> newsletter.
 * Everything above "trending" exists to get a visitor to a decision. Everything
 * below it is support. Resist adding shelves here: browse pages already exist
 * for that, and this page's job is to end the scrolling, not extend it.
 *
 * DATA BUDGET (deliberate, and the thing to protect):
 * this page makes exactly ONE TMDB request. A single global trending list
 * feeds the hero artwork, the seed recommendation, the trending rail and both
 * default Explore tabs. Guides and classics come from Supabase, which the page
 * already queries. Streaming services, quick picks and moods are static
 * configuration and fetch nothing at all.
 *
 * The previous homepage made about sixteen TMDB requests: one per content rail
 * plus one per "rich" streaming card. Everything interactive here runs
 * client-side against force-dynamic API routes, so no click a visitor makes can
 * create a persistent cache entry. Read docs/CACHING.md before adding a fetch.
 */

const noMovies = Promise.resolve([] as Movie[]);

export default async function HomePage() {
  const [movies, site, trending] = await Promise.all([
    getMovies(),
    getSiteConfig(),
    tmdbConfigured ? trendingLiveTmdb("all", 20) : noMovies,
  ]);

  // One list, sliced several ways. Nothing below this refetches.
  const pool = trending.length ? trending : movies;

  // Hero artwork comes from the admin's Hero Slides when they are set, and
  // falls back to trending when they are not. This is what keeps the Hero
  // Slides tab and the Sync Center's auto/manual hero mode meaningful now that
  // the old rotating hero carousel is gone - the admin still chooses the first
  // thing a visitor sees. Both getMovies() and getSiteConfig() were already
  // being read, so this costs no extra request.
  const chosen = site.hero.slides
    .map((id) => movies.find((m) => m.id === id))
    .filter((m): m is Movie => Boolean(m?.posterPath));
  const heroArt = (chosen.length >= 3 ? chosen : pool.filter((m) => m.posterPath)).slice(0, 3);
  // toPick() strips the cast array - PickStudio is a client component, so
  // everything handed to it is serialised into the page HTML.
  //
  // The seed ROTATES BY HOUR through the top of the pool instead of always
  // being trending #1. Trending #1 changes maybe once a day, so a fixed seed
  // made the recommendation look frozen - and identical to the first card of
  // the rail right below it. An hour index is deterministic within each ISR
  // window, so this stays ONE shared cache entry (never use randomness here;
  // per-request randomness is a cache-splitting bug, see docs/CACHING.md).
  const seedWindow = Math.min(pool.length, 10);
  const seedIdx = seedWindow > 0 ? new Date().getUTCHours() % seedWindow : 0;
  const seed = pool[seedIdx] ? toPick(pool[seedIdx]) : null;
  const seedPool = pool.filter((_, i) => i !== seedIdx).slice(0, 11).map(toPick);
  const trendingRail = pool.slice(0, 12);
  const exploreMovies = pool.filter((m) => m.kind === "movie").slice(0, 8);
  const exploreSeries = pool.filter((m) => m.kind === "series").slice(0, 8);

  // Client-side comparison against ids it is handed; nothing user-specific is
  // read during server rendering, so the page stays one shared cache entry.
  const latestIds = movies.slice(0, 12).map((m) => m.id);
  const latestTitles = Object.fromEntries(movies.slice(0, 12).map((m) => [m.id, m.title]));

  return (
    <div className="page page--home">
      <NewSinceLastVisit ids={latestIds} titles={latestTitles} />

      <HomeHero posters={heroArt} />

      {/* Quick Picks + moods + the single recommendation, in one client island
          so the three share state. Seeded from the server so the section is
          useful (and crawlable) before any JavaScript runs. */}
      <PickStudio seed={seed} seedPool={seedPool} />

      {trendingRail.length > 0 && (
        <Row
          title="Trending Tonight"
          sub="The most popular titles on TMDB right now"
          all={<Link className="sec__all" href="/trending">View all</Link>}
        >
          {trendingRail.map((m) => <MovieCard key={m.id} movie={toCard(m)} />)}
        </Row>
      )}

      <StreamingRow />

      <ExploreTabs movies={exploreMovies.map(toCard)} series={exploreSeries.map(toCard)} />

      {/* Free, legally watchable classics - the one shelf unique to
          CineTonight, and it costs a single Supabase read. */}
      <ClassicsRow />

      <BlogSection
        count={3}
        title="What to Watch Guides"
        sub="Written guides to help you decide"
      />

      <MyListPreview movies={movies.map(toCard)} />

      <section className="nlcta" aria-labelledby="newsletter-h">
        <div className="nlcta__copy">
          <h2 id="newsletter-h" className="nlcta__h">Never run out of something to watch</h2>
          <p className="nlcta__sub">
            One email a week: what just landed on your streaming services, what is worth
            your evening, and the OTT release dates we are tracking.
          </p>
        </div>
        <NewsletterForm />
      </section>
    </div>
  );
}
