import type { Movie, Blog, Review, ContinueItem, RowConfig, SiteConfig } from "./types";
import moviesJson from "@/content/movies.json";
import siteJson from "@/content/site.json";

/* Content lives in JSON so the /admin dashboard can edit it:
     content/movies.json — the catalogue (written by `npm run sync` and by /admin)
     content/site.json   — hero slides, home rows, blog posts, continue-watching
   Data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB. */

export const MOVIES: Movie[] = moviesJson as Movie[];
export const SITE: SiteConfig = siteJson as unknown as SiteConfig;

export const BLOGS: Blog[] = SITE.blog ?? [];
export const CONTINUE: ContinueItem[] = SITE.continueWatching ?? [];
export const HERO_SLIDES: string[] = SITE.hero?.slides ?? [];
export const HERO_INTERVAL: number = SITE.hero?.intervalMs ?? 6000;

export const GENRES: string[] = Array.from(new Set(MOVIES.flatMap((m) => m.genres))).sort();

export const getMovie = (id: string) => MOVIES.find((m) => m.id === id);
export const movieIds = () => MOVIES.map((m) => m.id);
export const getBlog = (slug: string) => BLOGS.find((b) => b.slug === slug);
export const blogSlugs = () => BLOGS.map((b) => b.slug);
export const byIds = (ids: string[]) => ids.map(getMovie).filter(Boolean) as Movie[];

/** Resolve a row config into actual titles — either a manual list or a live rule. */
export function resolveRow(row: RowConfig): Movie[] {
  if (row.mode === "manual") return byIds(row.items ?? []);
  const rule = row.rule ?? { kind: "all", sort: "year", limit: 6 };
  let list = MOVIES.slice();
  if (rule.kind && rule.kind !== "all") list = list.filter((m) => m.kind === rule.kind);
  if (rule.genre) list = list.filter((m) => m.genres.includes(rule.genre as string));
  const sort = rule.sort ?? "year";
  list.sort((a, b) => {
    if (sort === "rating") return b.rating - a.rating;
    if (sort === "votes") return (b.votes ?? 0) - (a.votes ?? 0);
    if (sort === "az") return a.title.localeCompare(b.title);
    return b.year - a.year; // "year" — newest first
  });
  return list.slice(0, rule.limit ?? 6);
}

export const ROWS_CONFIG: RowConfig[] = SITE.rows ?? [];
export const heroMovies = () => byIds(HERO_SLIDES);

/** Convenience selectors for the right rail / related widgets. */
export const topRated = (n = 4) => MOVIES.slice().sort((a, b) => b.rating - a.rating).slice(0, n);
export const trendingNow = (n = 5) => MOVIES.slice().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, n);
export const newestSeries = (n = 4) =>
  MOVIES.filter((m) => m.kind === "series").sort((a, b) => b.year - a.year).slice(0, n);

/** Reviews are illustrative, not from TMDB. */
export const REVIEWS: Review[] = [
  { name: "Arjun M.", rating: 5, when: "2 days ago", text: "Exactly what I wanted from it — the theatre was howling one minute and dead silent the next.", up: 245, down: 12 },
  { name: "Neha V.", rating: 4, when: "5 days ago", text: "Second half is stronger than the first. The supporting cast quietly steals the whole film.", up: 178, down: 8 },
  { name: "Rohit S.", rating: 5, when: "1 week ago", text: "Worth watching with a full crowd. Technically superb and genuinely moving in places.", up: 152, down: 7 },
];

/** Every unique person across the catalogue (for /person pages). */
export const PEOPLE = Array.from(
  new Map(MOVIES.flatMap((m) => m.cast.map((c) => [c.name, c] as const))).values()
);
export const personId = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const getPerson = (id: string) => PEOPLE.find((p) => personId(p.name) === id);
export const creditsOf = (name: string) => MOVIES.filter((m) => m.cast.some((c) => c.name === name));
