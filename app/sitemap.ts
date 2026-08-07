import type { MetadataRoute } from "next";
import { getMovies, getBlogs, genresOf } from "@/lib/data";
import { baseUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Every movie/series, every blog post, every genre, and the static pages —
 *  regenerated on each request from whatever's actually in Supabase right
 *  now, so it never drifts out of sync with the dashboard the way a
 *  hand-maintained sitemap would. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = baseUrl();
  const [movies, blogs] = await Promise.all([getMovies(), getBlogs()]);
  const genres = genresOf(movies);
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "", priority: 1 },
    { path: "/movies", priority: 0.8 },
    { path: "/tv-shows", priority: 0.8 },
    { path: "/web-series", priority: 0.8 },
    { path: "/trending", priority: 0.7 },
    { path: "/latest", priority: 0.7 },
    { path: "/genres", priority: 0.6 },
    { path: "/blog", priority: 0.6 },
    { path: "/pricing", priority: 0.4 },
  ].map(({ path, priority }) => ({ url: `${base}${path}`, lastModified: now, changeFrequency: "daily" as const, priority }));

  const movieRoutes: MetadataRoute.Sitemap = movies.map((m) => ({
    url: `${base}/movie/${m.id}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogs.map((b) => ({
    url: `${base}/blog/${b.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6,
  }));

  const genreRoutes: MetadataRoute.Sitemap = genres.map((g) => ({
    url: `${base}/movies?genre=${encodeURIComponent(g)}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5,
  }));

  return [...staticRoutes, ...movieRoutes, ...blogRoutes, ...genreRoutes];
}
