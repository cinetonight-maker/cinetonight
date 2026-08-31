import type { MetadataRoute } from "next";
import { getMovies, getBlogs, genresOf } from "@/lib/data";
import { canonicalGenre } from "@/lib/genres";
import { CHANNELS } from "@/lib/channels";
import { getClassics } from "@/lib/classics";
import { supabasePublic } from "@/lib/supabase/public";
import { trendingLiveTmdb, latestReleasesTmdb, topRatedTmdb, tmdbConfigured, preferCurated } from "@/lib/tmdb";
import { baseUrl } from "@/lib/site";
import { AUTHORS } from "@/lib/authors";

export const dynamic = "force-dynamic";

/** Every movie/series in the curated catalogue only gets a small slice of
 *  the actual TMDB library on the page — the homepage's "live" rows and a
 *  title's "Related"/"Featured" rail pull hundreds more directly from TMDB
 *  at request time (ids like "tmdb-m-1234"), and those pages are real,
 *  fully-rendered, indexable pages (see app/movie/[id]/page.tsx's
 *  `resolve()`) that were simply never listed anywhere for Google to find
 *  except by clicking through from another page. Pulling a batch of the
 *  same trending/latest/top-rated/regional TMDB lists used elsewhere on the
 *  site into the sitemap turns that "reachable but undiscovered" pile into
 *  actual indexed surface area — this is the single biggest lever available
 *  for "get Google to notice 1,000 movie pages" without writing content by
 *  hand. Bounded and deduped so sitemap generation stays fast and never
 *  balloons unboundedly. */
async function tmdbSitemapMovies(): Promise<{ id: string }[]> {
  if (!tmdbConfigured) return [];
  try {
    // getMovies() runs alongside the TMDB calls (it's React cache()'d, so
    // this is not a second Supabase query — the rest of sitemap() already
    // calls it too) and every list below is passed through preferCurated()
    // before it can turn into a sitemap URL, so a title already in the
    // catalogue is always listed under its own clean address here, never a
    // second tmdb-* entry for the same title (STAB-03 follow-up).
    const [curated, ...lists] = await Promise.all([
      getMovies(),
      trendingLiveTmdb("all", 40),
      latestReleasesTmdb("all", 40),
      topRatedTmdb("all", 40),
      trendingLiveTmdb("all", 40, "US"),
      trendingLiveTmdb("all", 40, "IN"),
    ]);
    const seen = new Set<string>();
    const out: { id: string }[] = [];
    for (const list of lists) {
      for (const m of preferCurated(list, curated)) {
        if (!seen.has(m.id)) { seen.add(m.id); out.push({ id: m.id }); }
      }
    }
    return out;
  } catch {
    // A slow/unreachable TMDB should never take the whole sitemap down —
    // worst case this batch is just missing until the next request.
    return [];
  }
}

/** Every movie/series, every blog post, every genre, every cast member, and
 *  the static pages — regenerated on each request from whatever's actually
 *  in Supabase (and, for the TMDB batch, live) right now, so it never
 *  drifts out of sync with the dashboard the way a hand-maintained sitemap
 *  would. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const [movies, blogs, tmdbMovies] = await Promise.all([getMovies(), getBlogs(), tmdbSitemapMovies()]);

  // Catalogue genre names folded onto the canonical browse-genre names and
  // deduped — see the genre block below for why.
  const genres = Array.from(
    new Set(genresOf(movies).map(canonicalGenre).filter((g): g is NonNullable<typeof g> => !!g)),
  ).sort();

  // NO `lastModified: new Date()` anywhere in this file any more. Stamping
  // every URL with "modified this second" on every crawl told Google the
  // ENTIRE site had just changed, every time it looked - an open invitation
  // to re-crawl thousands of SSR pages aggressively, which is server renders
  // and R2 writes, i.e. money. It is also a lie, and Google is documented to
  // ignore lastmod from sites that lie about it. So: pages we cannot date
  // honestly carry no lastModified at all (omitting it is valid), and blog
  // posts - the one thing we CAN date - use their real publish time.

  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "", priority: 1 },
    { path: "/movies", priority: 0.8 },
    { path: "/tv-shows", priority: 0.8 },
    { path: "/web-series", priority: 0.8 },
    { path: "/trending", priority: 0.7 },
    { path: "/latest", priority: 0.7 },
    { path: "/genres", priority: 0.6 },
    { path: "/blog", priority: 0.6 },
    // Added Phase 4A: /discover was linked from the homepage but absent here,
    // which is contradictory signalling about a page the site clearly treats
    // as useful. It is canonical, ISR-cached for a day and does zero data
    // fetches, so listing it costs nothing.
    { path: "/discover", priority: 0.6 },
  ].map(({ path, priority }) => ({ url: `${base}${path}`, changeFrequency: "daily" as const, priority }));

  // Channel pages ("what's streaming on Netflix/Prime/JioHotstar/..." )
  // refresh from live TMDB data on every visit, so daily is honest.
  const channelRoutes: MetadataRoute.Sitemap = CHANNELS.map((c) => ({
    url: `${base}/channel/${c.slug}`, changeFrequency: "daily" as const, priority: 0.7,
  }));

  // Published custom pages (About, Contact, Privacy, Terms, ...) at their
  // root-level URLs.
  let pageRoutes: MetadataRoute.Sitemap = [];
  try {
    const sb = supabasePublic();
    if (sb) {
      const { data } = await sb.from("pages").select("slug").eq("status", "published");
      pageRoutes = (data ?? []).map((r) => ({
        url: `${base}/${r.slug}`, changeFrequency: "monthly" as const, priority: 0.4,
      }));
    }
  } catch { /* pages table missing — skip */ }

  // Free Classics — the landing page plus every published watch page.
  const classicsList = await getClassics();
  const classicsRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/free-movies`, changeFrequency: "weekly" as const, priority: 0.7 },
    { url: `${base}/follow`, changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${base}/faq`, changeFrequency: "monthly" as const, priority: 0.5 },
    ...classicsList.map((c) => ({
      url: `${base}/free-movies/${c.slug}`, changeFrequency: "monthly" as const, priority: 0.6,
    })),
  ];

  const movieRoutes: MetadataRoute.Sitemap = movies.map((m) => ({
    url: `${base}/movie/${m.id}`, changeFrequency: "weekly" as const, priority: 0.8,
  }));

  // Live TMDB titles — same pages the "Related"/"Featured" rails and
  // homepage rows already link to, just newly listed here too.
  // Capped: advertising every live-TMDB page invited crawl storms over
  // thousands of SSR pages. Crawlers still DISCOVER the rest through
  // on-page links at their own pace; the sitemap now curates the core.
  const tmdbMovieRoutes: MetadataRoute.Sitemap = tmdbMovies.slice(0, 150).map((m) => ({
    url: `${base}/movie/${m.id}`, changeFrequency: "weekly" as const, priority: 0.6,
  }));

  // The one honest date we hold: a post's publish time.
  //
  // FILTERED, and this was a real bug: the sitemap listed every live post
  // regardless of its own SEO settings, so a post marked "hide from search"
  // was still SUBMITTED for indexing, and a post whose canonical points
  // elsewhere was still advertised as the original. Search Console reports the
  // first as "Submitted URL marked noindex" — an error, against a signal the
  // author deliberately set. A sitemap is a request to index; it must never
  // contradict the page it points at.
  const indexableBlogs = blogs.filter((b) => !b.noindex && !b.canonicalUrl?.trim());

  const blogRoutes: MetadataRoute.Sitemap = indexableBlogs.map((b) => ({
    url: `${base}/blog/${b.slug}`,
    ...(b.publishAt ? { lastModified: new Date(b.publishAt) } : {}),
    changeFrequency: "monthly" as const, priority: 0.6,
  }));

  // Genre landing pages. Phase 4A: these now come from the canonical browse
  // genre list (lib/genres.ts), not straight from the catalogue.
  //
  // WHY: genresOf() returns whatever names the catalogue happens to carry,
  // including TMDB's TV-only names. This file was therefore submitting
  // /movies?genre=Action%20%26%20Adventure — a name the movie-side genre
  // lookup does not recognise, so that URL rendered the UNFILTERED hub with
  // its own canonical tag. The sitemap was advertising an example of the exact
  // duplicate-page bug the browse routes now redirect away. Folded and
  // deduped above, so "Action" and "Action & Adventure" submit one URL.
  const genreRoutes: MetadataRoute.Sitemap = genres.map((g) => ({
    url: `${base}/movies?genre=${encodeURIComponent(g)}`, changeFrequency: "weekly" as const, priority: 0.5,
  }));

  // PERSON PAGES ARE DELIBERATELY ABSENT (removed Phase 4A).
  //
  // This block used to submit up to 50 /person/<name-slug> URLs. Two reasons
  // it is gone, both from docs/SEO-ARCHITECTURE-AUDIT.md:
  //
  // 1. The route is now `noindex, follow` (see app/person/[id]/page.tsx).
  //    Submitting a URL in a sitemap is an explicit request to index it;
  //    doing that for a page marked noindex is a contradiction, and Search
  //    Console reports it as one.
  // 2. These were not even the URLs the site links to. Every cast link emits
  //    /person/tmdb-p-<id>-<name>, so the sitemap and the internal links were
  //    advertising two different addresses for the same person, with no
  //    canonical joining them. That duplication is now resolved by a
  //    permanent redirect on the route itself.
  //
  // Person pages remain fully crawlable (no robots.txt Disallow) so Google
  // can reach them, read the noindex, and drop them.

  // Author pages. Few, static, and the entity signal behind every byline -
  // exactly the kind of page a sitemap is for, unlike the unbounded live-TMDB
  // title space this file deliberately caps above.
  const authorRoutes: MetadataRoute.Sitemap = AUTHORS.map((a) => ({
    url: `${base}/author/${a.slug}`, changeFrequency: "monthly" as const, priority: 0.4,
  }));

  return [...staticRoutes, ...pageRoutes, ...channelRoutes, ...classicsRoutes, ...movieRoutes, ...tmdbMovieRoutes, ...blogRoutes, ...genreRoutes, ...authorRoutes];
}
