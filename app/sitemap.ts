import type { MetadataRoute } from "next";
import { getMovies, getBlogs, genresOf, peopleOf, personId } from "@/lib/data";
import { CHANNELS } from "@/lib/channels";
import { getClassics } from "@/lib/classics";
import { supabasePublic } from "@/lib/supabase/public";
import { trendingLiveTmdb, latestReleasesTmdb, topRatedTmdb, tmdbConfigured } from "@/lib/tmdb";
import { baseUrl } from "@/lib/site";

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
    const lists = await Promise.all([
      trendingLiveTmdb("all", 40),
      latestReleasesTmdb("all", 40),
      topRatedTmdb("all", 40),
      trendingLiveTmdb("all", 40, "US"),
      trendingLiveTmdb("all", 40, "IN"),
    ]);
    const seen = new Set<string>();
    const out: { id: string }[] = [];
    for (const list of lists) {
      for (const m of list) {
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
  const genres = genresOf(movies);
  const people = peopleOf(movies);

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
  const blogRoutes: MetadataRoute.Sitemap = blogs.map((b) => ({
    url: `${base}/blog/${b.slug}`,
    ...(b.publishAt ? { lastModified: new Date(b.publishAt) } : {}),
    changeFrequency: "monthly" as const, priority: 0.6,
  }));

  const genreRoutes: MetadataRoute.Sitemap = genres.map((g) => ({
    url: `${base}/movies?genre=${encodeURIComponent(g)}`, changeFrequency: "weekly" as const, priority: 0.5,
  }));

  // Actor/cast pages — every person with at least one credit in the
  // curated catalogue (mirrors generateStaticParams in app/person/[id]).
  const personRoutes: MetadataRoute.Sitemap = people.slice(0, 50).map((p) => ({
    url: `${base}/person/${personId(p.name)}`, changeFrequency: "monthly" as const, priority: 0.4,
  }));

  return [...staticRoutes, ...pageRoutes, ...channelRoutes, ...classicsRoutes, ...movieRoutes, ...tmdbMovieRoutes, ...blogRoutes, ...genreRoutes, ...personRoutes];
}
