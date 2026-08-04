export type MovieKind = "movie" | "series";

export interface CastCredit {
  name: string;
  character: string;
  /** TMDB profile path, e.g. "/abc123.jpg" — null when TMDB has no photo. */
  profilePath?: string | null;
}

export interface Movie {
  id: string;
  /** TMDB id (present after `npm run sync`). */
  tmdbId?: number;
  title: string;
  year: number;
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
}

export interface Blog {
  slug: string; title: string; cat: string; excerpt: string;
  date: string; read: string;
  /** Article paragraphs. */
  body?: string[];
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
   *  "hollywood"/"bollywood" bias to that industry's origin country. */
  live?: "latest" | "trending" | "toprated" | "hollywood" | "bollywood";
}

export interface SiteConfig {
  hero: { slides: string[]; intervalMs?: number };
  rows: RowConfig[];
  continueWatching: ContinueItem[];
  blog: Blog[];
}
