export type MovieKind = "movie" | "series";

export interface CastCredit {
  name: string;
  character: string;
  /** TMDB profile path, e.g. "/abc123.jpg" — null when TMDB has no photo. */
  profilePath?: string | null;
  /** TMDB person id — present for cast fetched live from TMDB (fetchTitle)
   *  and titles re-synced after this field was added. Lets cast links
   *  route to /person/tmdb-p-<id> (resolved live via lib/tmdb.fetchPerson)
   *  instead of the name-slug route, which only ever covers people who
   *  appear in the local catalogue. */
  tmdbId?: number;
}

export interface Movie {
  id: string;
  /** TMDB id (present after `npm run sync`). */
  tmdbId?: number;
  title: string;
  year: number;
  /** Full release date "YYYY-MM-DD" when the source provides one — the
   *  reliable way to tell released from upcoming (lib/quality.releaseStatus).
   *  Older Supabase rows synced before Phase 2 lack it; releaseStatus falls
   *  back to the year alone. */
  releaseDate?: string | null;
  /** TMDB popularity score (page-traffic driven, reacts within hours of a
   *  big release). Used by the Latest freshness rescue in lib/quality —
   *  votes take days to accumulate, popularity doesn't. */
  popularity?: number;
  /** ISO 3166-1 origin country ("US", "IN", "KR"...) when the source
   *  exposes it. TMDB LIST hits only carry this for TV (origin_country);
   *  movie list hits omit it — detail fetches map production_countries.
   *  Used by lib/industry.industryOf (English + known non-US country →
   *  International). */
  originCountry?: string | null;
  genres: string[];
  kind: MovieKind;
  rating: number;
  votes?: number;
  runtime: string;
  cert: string;
  language: string;
  director: string;
  writers: string;
  cast: CastCredit[];
  desc: string;
  /** TMDB image paths — null falls back to placeholder art. */
  posterPath?: string | null;
  backdropPath?: string | null;
  /** YouTube key for the official trailer, when TMDB has one. */
  trailerKey?: string | null;
  /** Clips, featurettes and behind-the-scenes reels from the SAME TMDB
   *  response the trailer came from - no extra request. */
  clips?: { key: string; name: string; type: string }[];
  /** The director's TMDB profile photo, when there is one. */
  directorProfile?: string | null;
}

export interface Blog {
  slug: string; title: string; cat: string; excerpt: string;
  date: string; read: string;
  /** Article content. Markdown string since the CMS update; older rows are
   *  still an array of paragraphs, and lib/markdown.ts renders both shapes. */
  body?: string | string[];
  /** Featured image — a Media Library URL. Falls back to a placeholder when unset. */
  imageUrl?: string | null;
  /** Alt text for the featured image (accessibility + image SEO). */
  imageAlt?: string | null;
  /** Free-form tags, used for related-post suggestions. */
  tags?: string[];
  /** Present when the post comes from Supabase (needed for dashboard edit/delete). */
  id?: string;
  status?: "draft" | "published" | "scheduled";
  /** SEO overrides set in the dashboard; page falls back to title/excerpt. */
  metaTitle?: string;
  metaDescription?: string;
  /** Last real edit, taken from the row's own updated_at. Feeds JSON-LD
   *  dateModified. Never "now": a freshness signal that fires on every crawl
   *  is a lie, and Google is documented to ignore sites that tell it. */
  updatedAt?: string | null;
  /** When status is "scheduled": the moment the post goes live. */
  publishAt?: string | null;
  /* ---- SEO fields (supabase/blog_seo.sql). All optional: the site behaves
     exactly as before when the migration has not been run. ---- */
  /** The one phrase this article should rank for. Drives the editor checklist. */
  focusKeyword?: string;
  /** Supporting phrases — a planning aid, and the article's keyword meta tag. */
  secondaryKeywords?: string[];
  /** Set ONLY when this article is a copy of something that lives elsewhere.
   *  Blank means the article is its own canonical, which is almost always right. */
  canonicalUrl?: string | null;
  /** Social share image. Falls back to imageUrl when blank. */
  ogImage?: string | null;
  /** Per-article noindex. Default false. */
  noindex?: boolean;
  /** Author SLUG (see lib/authors.ts). Empty falls back to the default
   *  author, so posts written before per-post attribution existed still
   *  carry a real named byline. */
  author?: string | null;
}
export interface Review { name: string; rating: number; when: string; text: string; up: number; down: number; }
export interface ContinueItem { id: string; progress: number; note: string; }

/* ---------- editable site configuration (content/site.json) ---------- */

export type RowSort = "year" | "rating" | "votes" | "az";

export interface RowRule {
  kind?: MovieKind | "all";
  genre?: string;
  sort?: RowSort;
  limit?: number;
}

export interface RowConfig {
  id: string;
  title: string;
  /** "auto" picks titles by rule from the saved catalogue; "manual" uses an
   *  explicit ordered list; "live" pulls straight from TMDB at request time
   *  (falls back to "auto" behavior if TMDB is unreachable/unconfigured). */
  mode: "auto" | "manual" | "live";
  rule?: RowRule;
  items?: string[];
  style?: "plain" | "ranked" | "badge";
  badge?: string;
  /** Only used when mode === "live" — which TMDB feed to pull.
   *  "latest"/"trending"/"toprated" are an unrestricted global mix;
   *  "hollywood"/"bollywood"/"korean"/"chinese" bias to that industry's
   *  origin country; "anime" is Japanese-origin Animation specifically;
   *  "telugu" filters by original language rather than country, so it's a
   *  distinct list from "bollywood" (which already includes every Indian
   *  language via origin country). */
  live?: "latest" | "trending" | "toprated" | "hollywood" | "bollywood" | "korean" | "anime" | "chinese" | "telugu";
}

export interface SiteConfig {
  hero: { slides: string[]; intervalMs?: number };
  rows: RowConfig[];
  continueWatching: ContinueItem[];
  blog: Blog[];
}

/** The only fields a poster card actually renders.
 *
 *  MovieCard (and BigCard) are CLIENT components, so every property handed
 *  to them is serialized into the page's HTML and downloaded by every
 *  visitor. Passing full `Movie` objects shipped each title's entire cast
 *  array, plus runtime, cert, language, director, writers, votes, trailer
 *  key and both image paths - roughly two thirds of the bytes - to render a
 *  poster, a title and one meta line. With ~100 cards on the homepage that
 *  was the single largest payload on the site.
 *
 *  Project with `toCard()` at the server/client boundary. */
export type CardMovie = Pick<Movie, "id" | "title" | "year" | "genres" | "rating" | "desc" | "posterPath">;

export const toCard = (m: Movie | CardMovie): CardMovie => ({
  id: m.id, title: m.title, year: m.year, genres: m.genres,
  rating: m.rating, desc: m.desc, posterPath: m.posterPath,
});

/** BigCard renders a wide backdrop, so it needs that one extra path on top
 *  of the card fields. Kept separate from CardMovie so the ~100 poster cards
 *  on a page do not each carry a backdrop URL they never render. */
export type BigCardMovie = CardMovie & Pick<Movie, "backdropPath">;

export const toBigCard = (m: Movie): BigCardMovie => ({ ...toCard(m), backdropPath: m.backdropPath });

/** A Movie trimmed for client islands that render ONE title at a time.
 *
 *  Keeps the full Movie shape - TicketStub and WhereToWatch both take a Movie -
 *  but drops `cast`, which is by far the heaviest field and is never read on
 *  the homepage. Without this the homepage shipped twelve full cast lists into
 *  the RSC payload (the seed pick plus its "Another pick" pool) for markup that
 *  never displays a single actor. */
export const toPick = (m: Movie): Movie => ({ ...m, cast: [] });
