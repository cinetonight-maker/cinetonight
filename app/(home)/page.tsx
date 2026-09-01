import Link from "next/link";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import BlogSection from "@/components/BlogSection";
import NewSinceLastVisit from "@/components/NewSinceLastVisit";
import NewsletterForm from "@/components/NewsletterForm";
import HomeHero from "@/components/home/HomeHero";
import HomeHeroV2 from "@/components/home/HomeHeroV2";
import HowPicksWorkV2 from "@/components/home/HowPicksWorkV2";
import PickStudio from "@/components/home/PickStudio";
import StreamingRow from "@/components/home/StreamingRow";
import ExploreTabs from "@/components/home/ExploreTabs";
import MyListPreview from "@/components/home/MyListPreview";
import { getMovies, getSiteConfig } from "@/lib/data";
import { getHomepageConfig } from "@/lib/homepage";
import { getDiscoveryConfig } from "@/lib/discovery";
import { enabledMoods, enabledQuickPicks, enabledExploreTabs, enabledProviders } from "@/lib/discoveryConfig";
import { visibleSections, type SectionId } from "@/lib/homepageConfig";
import { trendingLiveTmdb, bollywoodTmdb, southIndianTmdb, koreanTmdb, tmdbConfigured, preferCurated } from "@/lib/tmdb";
import { mixDiscovery, industryOf } from "@/lib/industry";
import { discoveryFilter } from "@/lib/quality";
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

// Build-time V2 template switch — same flag, same rules as /movie/[id]
// (docs/V2-BUILD-PATH.md Phase 5): one shared ISR entry either way, no
// per-visitor branching, launch flips the env at deploy.
const V2_TEMPLATE = process.env.NEXT_PUBLIC_V2_THEME === "1";

export default async function HomePage() {
  // Phase 3 data budget: FOUR TMDB requests, all server-side and all served
  // from the shared fetch cache (6h TMDB TTL), so across a whole TTL window
  // this page still triggers each underlying TMDB call once. The three
  // region pools exist to fix the Hollywood-heavy mix (§14): they feed the
  // "For You" Explore blend at ~45/25/20/10, quality-first.
  const [movies, site, trendingRaw, bollyRaw, southRaw, koreanRaw] = await Promise.all([
    getMovies(),
    getSiteConfig(),
    tmdbConfigured ? trendingLiveTmdb("all", 20) : noMovies,
    tmdbConfigured ? bollywoodTmdb("all", 8).catch(() => [] as Movie[]) : noMovies,
    tmdbConfigured ? southIndianTmdb("all", 8).catch(() => [] as Movie[]) : noMovies,
    tmdbConfigured ? koreanTmdb("all", 8).catch(() => [] as Movie[]) : noMovies,
  ]);
  // STAB-03 follow-up: swap in the catalogue's own title (and its clean
  // address) wherever one of these live TMDB rows is something you've
  // already added, so the homepage never links to a tmdb-* address for a
  // title that already has a real one. No extra fetch or delay - movies is
  // already resolved above.
  const trending = preferCurated(trendingRaw, movies);
  const bolly = preferCurated(bollyRaw, movies);
  const south = preferCurated(southRaw, movies);
  const korean = preferCurated(koreanRaw, movies);

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
  // "For You" Explore blend — deterministic, quality-first (Tier C cannot
  // enter; see mixDiscovery), built entirely from the pools above.
  const exploreMixed = mixDiscovery({
    hollywood: discoveryFilter(pool.filter((m) => industryOf(m) === "hollywood")),
    bollywood: discoveryFilter(bolly),
    south: discoveryFilter(south),
    korean: discoveryFilter(korean),
    international: discoveryFilter(pool.filter((m) => industryOf(m) === "international")),
  }, 10);

  // Client-side comparison against ids it is handed; nothing user-specific is
  // read during server rendering, so the page stays one shared cache entry.
  const latestIds = movies.slice(0, 12).map((m) => m.id);
  const latestTitles = Object.fromEntries(movies.slice(0, 12).map((m) => [m.id, m.title]));

  // What the dashboard says this page should show. Reads `live_config` only,
  // and falls back to the shipped default on any problem — a configuration
  // fault can never blank the homepage. See lib/homepage.ts.
  const home = await getHomepageConfig();
  // Which moods, Quick Picks and Explore tabs to OFFER. One small cached read;
  // no TMDB call and no extra work for the recommendation engine — the config
  // only filters and orders lists that were already in memory.
  const disc = await getDiscoveryConfig();
  const discovery = {
    moods: enabledMoods(disc).map((id) => ({ id, label: disc.moods.entries[id].label!, icon: disc.moods.entries[id].icon! })),
    quickPicks: enabledQuickPicks(disc).map((id) => ({
      id, label: disc.quickPicks.entries[id].label!, sub: disc.quickPicks.entries[id].sub!, icon: disc.quickPicks.entries[id].icon!,
    })),
  };
  const exploreTabs = enabledExploreTabs(disc).map((id) => ({ id, label: disc.explore.entries[id].label! }));
  const providerSlugs = enabledProviders(disc) as string[];
  const shown = new Set<SectionId>(visibleSections(home));
  const on = (id: SectionId) => shown.has(id);
  const sec = (id: SectionId) => home.sections[id];

  const SECTIONS: Record<SectionId, React.ReactNode> = {
    trending: trendingRail.length > 0 && on("trending") ? (
      <Row
        key="trending"
        title={sec("trending").title ?? "Trending Tonight"}
        sub={sec("trending").sub ?? "The most popular titles on TMDB right now"}
        all={<Link className="sec__all" href="/trending">View all</Link>}
      >
        {trendingRail.slice(0, sec("trending").count ?? 6).map((m) => <MovieCard key={m.id} movie={toCard(m)} />)}
      </Row>
    ) : null,

    streaming: on("streaming") ? <StreamingRow key="streaming" slugs={providerSlugs} /> : null,

    explore: on("explore") ? <ExploreTabs key="explore" mixed={exploreMixed.map(toCard)} tabs={exploreTabs} defaultTab={disc.explore.defaultTab} /> : null,

    guides: on("guides") ? (
      <BlogSection
        key="guides"
        count={sec("guides").count ?? 3}
        title={sec("guides").title ?? "What to Watch Guides"}
        sub={sec("guides").sub ?? "Written guides to help you decide"}
        analyticsSurface="homepage"
      />
    ) : null,

    myList: on("myList") ? <MyListPreview key="myList" movies={movies.map(toCard)} /> : null,

    newsletter: on("newsletter") ? (
      <section className="nlcta" key="newsletter" aria-labelledby="newsletter-h">
        <div className="nlcta__copy">
          <h2 id="newsletter-h" className="nlcta__h">{sec("newsletter").title ?? "Never run out of something to watch"}</h2>
          <p className="nlcta__sub">{sec("newsletter").sub ?? "One email a week: what just landed on your streaming services, what is worth your evening, and the OTT release dates we are tracking."}</p>
        </div>
        <NewsletterForm />
      </section>
    ) : null,
  };

  return (
    <div className="page page--home">
      <NewSinceLastVisit ids={latestIds} titles={latestTitles} />

      {/* LOCKED SPINE (Phase 3 §3). The hero question and the picker are what
          this page is for, so they are not configurable — see
          lib/homepageConfig.ts. Everything below them is. */}
      {V2_TEMPLATE ? (
        /* V2 fanned card-stack hero (canvas Main/Mobile). Same inputs, same
           data budget; the badge tells the truth about where the art came
           from — admin Hero Slides vs the trending fallback. */
        <HomeHeroV2
          posters={heroArt}
          title={home.hero.title}
          sub={home.hero.sub}
          badge={chosen.length >= 3 ? "Featured tonight" : "Popular tonight"}
        />
      ) : (
        <HomeHero posters={heroArt} title={home.hero.title} sub={home.hero.sub} />
      )}

      {/* Quick Picks + moods + the single recommendation, in one client island
          so the three share state. Seeded from the server so the section is
          useful (and crawlable) before any JavaScript runs. */}
      <PickStudio seed={seed} seedPool={seedPool} discovery={discovery} />

      {/* V2-only static explainer right after the picker — no data, no fetch. */}
      {V2_TEMPLATE && <HowPicksWorkV2 />}

      {/* Order, on/off, headings and counts all come from the dashboard. */}
      {home.order.map((id) => SECTIONS[id] ?? null)}

    </div>
  );
}
