import "server-only";
import { rankByWeightedRating, discoveryFilter } from "./quality";
import { cache } from "react";
import type { Movie, Blog, Review, RowConfig, SiteConfig, ContinueItem, CastCredit } from "./types";
import { supabasePublic, PUBLIC_TTL } from "./supabase/public";
import { personSlug } from "./personUrl";
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
    imageAlt: r.image_alt ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    date: r.date_label ?? "",
    read: r.read_label ?? "",
    status: r.status,
    metaTitle: r.meta_title || undefined,
    metaDescription: r.meta_description || undefined,
    publishAt: r.publish_at ?? null,
    // Real revision time, for JSON-LD dateModified. Never "now" — a freshness
    // signal that fires on every crawl is a lie Google learns to ignore.
    updatedAt: r.updated_at ?? null,
    focusKeyword: r.focus_keyword || undefined,
    secondaryKeywords: Array.isArray(r.secondary_keywords) ? r.secondary_keywords : [],
    canonicalUrl: r.canonical_url || null,
    ogImage: r.og_image || null,
    noindex: r.noindex === true,
    author: r.author || null,
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
  // catalogue tier (6h): the sync adds a handful of titles a day, and this
  // fetch runs inside movie/listing routes - a shorter TTL here would become
  // those routes' effective revalidate ceiling (see lib/supabase/public.ts).
  const sb = supabasePublic(PUBLIC_TTL.catalogue);
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
  // Resolved against the FULL cached list, never a per-id query. The old
  // per-id `.eq("id", <id>)` version embedded every requested id - including
  // every live-TMDB id and any junk a crawler invents - in its own Supabase
  // fetch URL, and every unique fetch URL is its own R2 data-cache entry.
  // Movie ids are an unbounded space, so that was an unbounded cache writer
  // sitting on the hottest route family on the site. It was also redundant:
  // getMovies() selects the whole table, so any row the per-id query could
  // find is already in this list, and the bundled-JSON fallback below covers
  // the empty-table case exactly as before. DB row wins when present.
  const all = await getMovies();
  return all.find((m) => m.id === id) ?? FALLBACK_MOVIES.find((m) => m.id === id) ?? null;
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

/** "Recently Added" — the newest titles the editor has actually put into
 *  the catalogue (dashboard adds / sync runs), ordered by when the row was
 *  CREATED in Supabase, not by release year. getMovies() orders by year,
 *  which answers "what's newest in cinema" — this answers "what did the
 *  editor add most recently", which is a deliberately manual, human-curated
 *  list (it only changes when the catalogue does, never auto-updates from
 *  TMDB). Falls back to bundled-snapshot order if Supabase is unreachable. */
export const recentlyAdded = cache(async (kind: Movie["kind"], n = 6): Promise<Movie[]> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb
      .from("movies")
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(n);
    if (!error && data && data.length > 0) return data.map(movieFromRow);
  }
  return FALLBACK_MOVIES.filter((m) => m.kind === kind).slice(0, n);
});

export const genresOf = (movies: Movie[]): string[] => Array.from(new Set(movies.flatMap((m) => m.genres))).sort();
// Phase 2: confidence-aware (Bayesian) instead of raw vote_average — see
// lib/quality.rankByWeightedRating for the formula and thresholds.
export const topRated = (movies: Movie[], n = 4) => rankByWeightedRating(movies).slice(0, n);
export const trendingNow = (movies: Movie[], n = 5) => discoveryFilter(movies.slice().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))).slice(0, n);
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
const BLOG_LIST_COLUMNS = "id, slug, title, cat, excerpt, image_url, date_label, read_label, status, publish_at, created_at";

/** The SEO columns supabase/blog_seo.sql adds. Selected SEPARATELY, with a
 *  fallback, because naming a column that does not exist yet fails the WHOLE
 *  query — which would blank the blog on an install that has not run that file.
 *
 *  The sitemap needs `noindex` and `canonical_url`: without them it happily
 *  submits a post you have marked "hide from search", which Search Console
 *  reports as an error against a signal you deliberately set. Bodies are still
 *  excluded — this stays a light query. */
const BLOG_SEO_COLUMNS = "noindex, canonical_url";

/** Is this row visible on the site right now?
 *
 *  Evaluated in JS, NOT in the Supabase query - and that distinction is a
 *  caching bug fix, not a style choice. The old queries embedded
 *  `publish_at.lte.<new Date().toISOString()>` in the request, which put a
 *  MILLISECOND-precision timestamp in the fetch URL. The data cache keys on
 *  the URL, so every single render produced a brand-new key: a guaranteed
 *  cache miss plus a brand-new R2 Class A write, forever, with the old
 *  entries left behind as orphans. Exactly the class of leak described in
 *  docs/CACHING.md. Keeping the URL stable ("give me published + scheduled")
 *  and doing the time comparison here costs a few filtered rows and makes
 *  the query cacheable - and scheduled posts still go live at the exact
 *  minute, on the next ISR render after their time passes. */
const isLiveNow = (row: Record<string, unknown>) =>
  row.status === "published" ||
  (row.status === "scheduled" && !!row.publish_at && new Date(row.publish_at as string).getTime() <= Date.now());

/** `ttl` picks the freshness tier and MATTERS for route ceilings: blog
 *  SURFACES (/blog, /blog/[slug], RSS) use the default 30-min tier so a
 *  scheduled post appears on time - but embedded teasers (BlogSection on
 *  genres/listing pages, BlogWidget on movie pages) pass the 6h catalogue
 *  tier, because a teaser being a few hours stale is invisible while its
 *  fetch TTL was silently capping every HOST route at 30 minutes. */
export const getBlogs = cache(async (ttl: number = PUBLIC_TTL.default): Promise<Blog[]> => {
  // Tagged so an admin Publish/Update can mark exactly this query stale
  // (lib/revalidateCms.ts). The TTL tier is unchanged.
  const sb = supabasePublic(ttl as never, ["cms:blog"]);
  if (sb) {
    const list = (columns: string) => sb
      .from("blog_posts")
      .select(columns)
      .in("status", ["published", "scheduled"])
      .order("created_at", { ascending: false });

    // Try with the SEO columns; fall back to the base set if blog_seo.sql has
    // not been run. Two fixed query URLs, so the data cache stays bounded.
    let { data, error } = await list(`${BLOG_LIST_COLUMNS}, ${BLOG_SEO_COLUMNS}`);
    if (error) ({ data, error } = await list(BLOG_LIST_COLUMNS));
    // Same reasoning as getMovies(): an empty table before migration
    // shouldn't render a blank blog section.
    // The cast is needed because the column list is a runtime string, so
    // PostgREST's types degrade to GenericStringError[] — the same cast the
    // media-usage route needs for the same reason.
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (!error && rows.length > 0) return rows.filter(isLiveNow).map(blogFromRow);
  }
  return FALLBACK_SITE.blog ?? [];
});

export const getBlog = cache(async (slug: string): Promise<Blog | null> => {
  // Tagged with BOTH the collection tag and this post's own tag, so a
  // publish can invalidate one article without touching the others.
  const sb = supabasePublic(PUBLIC_TTL.default, ["cms:blog", `cms:blog:${slug}`]);
  if (sb) {
    // Membership check against the LIST first (one stable, cached query URL).
    // Without it, every /blog/<junk> a crawler or attacker requested embedded
    // that junk slug in a per-slug Supabase query URL - and every unique
    // fetch URL is its own data-cache entry, i.e. an R2 write per spray hit.
    // Real slugs (the only ones that reach the per-slug query below) are a
    // small bounded set, so the cache keys stay bounded too.
    const known = (await getBlogs()).some((b) => b.slug === slug);
    if (!known) return null;
    const { data, error } = await sb.from("blog_posts").select("*").eq("slug", slug)
      .in("status", ["published", "scheduled"])
      .maybeSingle();
    if (!error && data) return isLiveNow(data) ? blogFromRow(data) : null;
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
  siteTitle: "CineTonight — What to Watch Tonight: Trailers & OTT Picks",
  siteDescription: "Know what to watch tonight — trailers, ratings, OTT release updates and where to legally stream movies, web series, K-Drama & anime.",
  metaKeywords: "",
  contactEmail: "officialcinetonight@gmail.com",
  social: {
    facebook: "https://www.facebook.com/cinetonight1/",
    youtube: "https://www.youtube.com/@cinetonight",
    tiktok: "https://www.tiktok.com/@cine.tonight",
    instagram: "https://www.instagram.com/cinetonight",
  },
  maintenanceMode: false,
};

// Dashboard → SEO & Settings saves to the `site_settings` table, but until
// now nothing on the public site ever read it back — editing "Site title"
// or the social links there had zero visible effect. This wires it up: the
// root layout's <title>/meta description and the footer's social icons now
// come from here, and RootLayout uses maintenanceMode to gate the whole
// public site (see components/MaintenanceGate.tsx).
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const sb = supabasePublic(PUBLIC_TTL.stable, ["cms:settings"]);
  if (sb) {
    const { data, error } = await sb.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (!error && data) {
      return {
        siteTitle: data.site_title || FALLBACK_SETTINGS.siteTitle,
        siteDescription: data.site_description || FALLBACK_SETTINGS.siteDescription,
        metaKeywords: data.meta_keywords || "",
        contactEmail: data.contact_email || FALLBACK_SETTINGS.contactEmail,
        social: data.social && typeof data.social === "object" && Object.values(data.social).some(Boolean)
          ? data.social
          : FALLBACK_SETTINGS.social,
        maintenanceMode: !!data.maintenance_mode,
      };
    }
  }
  return FALLBACK_SETTINGS;
});

/* ------------------------------- people ----------------------------------- */

/** Phase 4A: this was a second, subtly DIFFERENT copy of the person slug rule
 *  — it had no `.slice(0, 60)`, so a name longer than 60 characters produced a
 *  link (built by lib/tmdb.ts) that this lookup could never match. Now both
 *  read lib/personUrl.ts, which is also what the route's canonical/redirect
 *  logic uses, so the three can no longer disagree. */
export const personId = personSlug;

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
