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
  /** Featured image — a Media Library URL. Falls back to a placeholder when unset. */
  imageUrl?: string | null;
  /** Present when the post comes from Supabase (needed for dashboard edit/delete). */
  id?: string;
  status?: "draft" | "published" | "scheduled";
  /** SEO overrides set in the dashboard; page falls back to title/excerpt. */
  metaTitle?: string;
  metaDescription?: string;
  /** When status is "scheduled": the moment the post goes live. */
  publishAt?: string | null;
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
