import "server-only";
import { cache } from "react";
import type { Movie, Blog, Review, RowConfig, SiteConfig, ContinueItem, CastCredit } from "./types";
import { supabasePublic } from "./supabase/public";
import moviesJson from "@/content/movies.json";
import siteJson from "@/content/site.json";

/* Content lives in Supabase (movies / home_config / blog_posts tables) —
   see supabase/schema.sql and scripts/migrate-content-to-supabase.mjs.
   content/*.json is kept only as an OFFLINE FALLBACK: if Supabase isn't
   configured yet (env vars unset) or is briefly unreachable, the site
   still renders from the last-synced snapshot instead of going blank.
   Data ultimately from TMDB — this product uses the TMDB API but is not
   endorsed or certified by TMDB. */

const FALLBACK_MOVIES = moviesJson as Movie[];
const FALLBACK_SITE = siteJson as unknown as SiteConfig;

function movieFromRow(r: any): Movie {
  return {
    id: r.id,
    tmdbId: r.tmdb_id ?? undefined,
    title: r.title,
    year: r.year,
    genres: r.genres ?? [],
    kind: r.kind,
    rating: Number(r.rating) || 0,
    votes: r.votes ?? undefined,
    runtime: r.runtime ?? "",
    cert: r.cert ?? "",
    language: r.language ?? "",
    director: r.director ?? "",
    writers: r.writers ?? "",
    cast: r.cast_list ?? [],
    desc: r.description ?? "",
    posterPath: r.poster_url ?? r.poster_path ?? null,
    backdropPath: r.backdrop_url ?? r.backdrop_path ?? null,
    trailerKey: r.trailer_key ?? null,
  };
}

function blogFromRow(r: any): Blog {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    cat: r.cat,
    excerpt: r.excerpt,
    body: r.body ?? [],
    imageUrl: r.image_url ?? null,
    date: r.date_label ?? "",
    read: r.read_label ?? "",
    status: r.status,
  };
}

/* ------------------------------- movies --------------------------------- */

// Wrapped in React's cache() so that a single page render only ever hits
// Supabase once for the same call, no matter how many Server Components
// independently need it (e.g. the home page's rows AND the sidebar's
// TrendingWidget AND GenresWidget all call getMovies() — without this
// they'd each fire their own redundant query). This is per-request only:
// it's cleared for every new request, so it can never serve stale data
// across requests (unlike the fetch-cache issue fixed in lib/supabase/*).
export const getMovies = cache(async (): Promise<Movie[]> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb.from("movies").select("*").order("year", { ascending: false });
    // An empty result almost always means the one-time migration script
    // hasn't been run yet (or Supabase isn't reachable) rather than a
    // deliberately-emptied catalogue — fall back to the bundled snapshot
    // instead of rendering a blank site.
    if (!error && data && data.length > 0) return data.map(movieFromRow);
  }
  return FALLBACK_MOVIES;
});

export const getMovie = cache(async (id: string): Promise<Movie | null> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb.from("movies").select("*").eq("id", id).maybeSingle();
    if (!error && data) return movieFromRow(data);
    if (!error) return null; // reached Supabase, genuinely not found there
  }
  return FALLBACK_MOVIES.find((m) => m.id === id) ?? null;
});

export const movieIds = async () => (await getMovies()).map((m) => m.id);
export const byIds = (ids: string[], movies: Movie[]) => ids.map((id) => movies.find((m) => m.id === id)).filter(Boolean) as Movie[];

/** Resolve a row config into actual titles — either a manual list or a rule, against an already-fetched catalogue. */
export function resolveRow(row: RowConfig, movies: Movie[]): Movie[] {
  if (row.mode === "manual") return byIds(row.items ?? [], movies);
  const rule = row.rule ?? { kind: "all", sort: "year", limit: 6 };
  let list = movies.slice();
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

export const genresOf = (movies: Movie[]): string[] => Array.from(new Set(movies.flatMap((m) => m.genres))).sort();
export const topRated = (movies: Movie[], n = 4) => movies.slice().sort((a, b) => b.rating - a.rating).slice(0, n);
export const trendingNow = (movies: Movie[], n = 5) => movies.slice().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, n);
export const newestSeries = (movies: Movie[], n = 4) =>
  movies.filter((m) => m.kind === "series").sort((a, b) => b.year - a.year).slice(0, n);

/* ---------------------------- home config -------------------------------- */

export const getSiteConfig = cache(async (): Promise<Omit<SiteConfig, "blog">> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb.from("home_config").select("*").eq("id", 1).maybeSingle();
    if (!error && data) {
      return {
        hero: { slides: data.hero_slides ?? [], intervalMs: data.hero_interval_ms ?? 6000 },
        rows: data.rows ?? [],
        continueWatching: data.continue_watching ?? [],
      };
    }
  }
  return { hero: FALLBACK_SITE.hero, rows: FALLBACK_SITE.rows, continueWatching: FALLBACK_SITE.continueWatching };
});

/* -------------------------------- blog ------------------------------------ */

// Every caller of the LIST function (sitemap.ts, app/blog/page.tsx,
// RightRail's BlogWidget, BlogSection.tsx, rss.xml) only ever renders
// title/excerpt/date/read-time/image — none of them touch `.body` (verified:
// nothing outside app/blog/[slug]/page.tsx, which uses the separate
// single-row getBlog(slug) below, references it). `body` is the full
// article content as a jsonb array of paragraphs, easily the largest field
// on the row, so leaving it out of the list query is a real, safe
// reduction — unlike lib/data.ts's getMovies() below, whose "list" columns
// (cast, description) turned out to be genuinely rendered on every card
// (see components/MovieCard.tsx's synopsis line) and can't be trimmed the
// same way without breaking that.
const BLOG_LIST_COLUMNS = "id, slug, title, cat, excerpt, image_url, date_label, read_label, status, created_at";

export const getBlogs = cache(async (): Promise<Blog[]> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb
      .from("blog_posts")
      .select(BLOG_LIST_COLUMNS)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    // Same reasoning as getMovies(): an empty table before migration
    // shouldn't render a blank blog section.
    if (!error && data && data.length > 0) return data.map(blogFromRow);
  }
  return FALLBACK_SITE.blog ?? [];
});

export const getBlog = cache(async (slug: string): Promise<Blog | null> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb.from("blog_posts").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    if (!error && data) return blogFromRow(data);
    if (!error) return null;
  }
  return (FALLBACK_SITE.blog ?? []).find((b) => b.slug === slug) ?? null;
});
export const blogSlugs = async () => (await getBlogs()).map((b) => b.slug);

/* ----------------------------- site settings ------------------------------ */

export type SiteSettings = {
  siteTitle: string; siteDescription: string; metaKeywords: string; contactEmail: string;
  social: Record<string, string>; maintenanceMode: boolean;
};
const FALLBACK_SETTINGS: SiteSettings = {
  siteTitle: "MOVIEX — Watch More, Stream Better",
  siteDescription: "Stream the latest movies, web series, K-Drama, anime and C-Drama in HD. Trending titles, top rated picks, and your personal watchlist.",
  metaKeywords: "",
  contactEmail: "",
  social: {},
  maintenanceMode: false,
};

// Dashboard → SEO & Settings saves to the `site_settings` table, but until
// now nothing on the public site ever read it back — editing "Site title"
// or the social links there had zero visible effect. This wires it up: the
// root layout's <title>/meta description and the footer's social icons now
// come from here, and RootLayout uses maintenanceMode to gate the whole
// public site (see components/MaintenanceGate.tsx).
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (!error && data) {
      return {
        siteTitle: data.site_title || FALLBACK_SETTINGS.siteTitle,
        siteDescription: data.site_description || FALLBACK_SETTINGS.siteDescription,
        metaKeywords: data.meta_keywords || "",
        contactEmail: data.contact_email || "",
        social: data.social && typeof data.social === "object" ? data.social : {},
        maintenanceMode: !!data.maintenance_mode,
      };
    }
  }
  return FALLBACK_SETTINGS;
});

/* ------------------------------- people ----------------------------------- */

export const personId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const peopleOf = (movies: Movie[]): CastCredit[] =>
  Array.from(new Map(movies.flatMap((m) => m.cast.map((c) => [c.name, c] as const))).values());

export const getPerson = (movies: Movie[], id: string) => peopleOf(movies).find((p) => personId(p.name) === id);
export const creditsOf = (movies: Movie[], name: string) => movies.filter((m) => m.cast.some((c) => c.name === name));

/** Reviews are illustrative, not from TMDB. */
export const REVIEWS: Review[] = [
  { name: "Arjun M.", rating: 5, when: "2 days ago", text: "Exactly what I wanted from it — the theatre was howling one minute and dead silent the next.", up: 245, down: 12 },
  { name: "Neha V.", rating: 4, when: "5 days ago", text: "Second half is stronger than the first. The supporting cast quietly steals the whole film.", up: 178, down: 8 },
  { name: "Rohit S.", rating: 5, when: "1 week ago", text: "Worth watching with a full crowd. Technically superb and genuinely moving in places.", up: 152, down: 7 },
];
