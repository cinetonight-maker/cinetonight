import type { Movie } from "./types";

/** Mood → genre mapping for the "Mood Roulette" picker (components/MoodRoulette.tsx).
 *
 *  Matching is TIERED, not "any overlap": the old any-overlap rule meant an
 *  action film that happened to carry a secondary "Drama" tag qualified as
 *  a Heartbreak pick — exactly the wrong-vibe result users noticed. Now:
 *
 *  1. A movie whose PRIMARY genre (genres[0], TMDB orders by relevance)
 *     matches the mood — and which carries no excluded genre — is a
 *     first-class candidate.
 *  2. If that tier is too thin (< MIN_POOL), widen to any-genre overlap,
 *     still enforcing the exclusions (this is the key fix: "Action" never
 *     enters the Heartbreak pool no matter what its secondary tags say).
 *  3. Only if even that is empty does it fall back to overlap-sans-
 *     exclusions, then the whole catalogue — so the picker never dead-ends.
 */
export interface Mood {
  id: string;
  label: string;
  emoji: string;
  genres: string[];
  /** Genres that instantly disqualify a title for this mood, regardless of overlap. */
  exclude?: string[];
}

export const MOODS: Mood[] = [
  {
    id: "heartbreak", label: "Heartbreak", emoji: "\u{1F494}",
    genres: ["Romance", "Drama"],
    exclude: ["Action", "Action & Adventure", "Horror", "Thriller", "Crime", "War", "Science Fiction", "Sci-Fi"],
  },
  {
    id: "adrenaline", label: "Adrenaline Rush", emoji: "⚡",
    genres: ["Action", "Action & Adventure", "Thriller", "War"],
    exclude: ["Romance"],
  },
  {
    id: "laugh", label: "Laugh Out Loud", emoji: "\u{1F602}",
    genres: ["Comedy"],
    exclude: ["Horror", "War"],
  },
  {
    id: "chills", label: "Spine-Chiller", emoji: "\u{1F47B}",
    genres: ["Horror", "Thriller", "Mystery"],
    exclude: ["Comedy", "Romance", "Family"],
  },
  {
    id: "epic", label: "Epic Journey", emoji: "\u{1F5FA}️",
    genres: ["Adventure", "Action & Adventure", "Fantasy", "Sci-Fi & Fantasy", "History", "War"],
    exclude: [],
  },
  {
    id: "mindbender", label: "Mind Bender", emoji: "\u{1F9E0}",
    genres: ["Mystery", "Science Fiction", "Sci-Fi", "Sci-Fi & Fantasy", "Thriller", "Crime"],
    exclude: ["Comedy", "Romance", "Family"],
  },
  {
    id: "feelgood", label: "Feel Good", emoji: "☀️",
    genres: ["Comedy", "Romance", "Family", "Music", "Adventure", "Animation"],
    exclude: ["Horror", "Crime", "War", "Thriller"],
  },
  { id: "surprise", label: "Surprise Me", emoji: "\u{1F3B2}", genres: [] },
];

/** Below this many first-tier matches, widen to the next tier — small
 *  catalogues would otherwise make every spin land on the same 1-2 titles. */
const MIN_POOL = 3;

const hasExcluded = (m: Pick<Movie, "genres">, mood: Mood) =>
  (mood.exclude ?? []).some((g) => m.genres.includes(g));
const overlaps = (m: Pick<Movie, "genres">, mood: Mood) =>
  m.genres.some((g) => mood.genres.includes(g));

/** Movies matching a mood — tiered as documented above. */
/** The only fields mood filtering and the roulette card actually need.
 *  Deliberately narrow: MoodRoulette is a CLIENT component, so whatever
 *  shape is handed to it is serialized into the homepage HTML and
 *  downloaded by every visitor. Passing full Movie objects shipped each
 *  title's entire cast array, synopsis and every unused field to the
 *  browser for no reason. */
export type MoodMovie = Pick<Movie, "id" | "title" | "year" | "genres" | "rating" | "desc" | "posterPath">;

export function moviesForMood<T extends Pick<Movie, "genres">>(mood: Mood, movies: T[]): T[] {
  if (!mood.genres.length) return movies; // "Surprise Me" — true random

  const primary = movies.filter(
    (m) => m.genres[0] && mood.genres.includes(m.genres[0]) && !hasExcluded(m, mood)
  );
  if (primary.length >= MIN_POOL) return primary;

  const cleanOverlap = movies.filter((m) => overlaps(m, mood) && !hasExcluded(m, mood));
  // Merge (primary first — they're the best fits) rather than discard tier 1.
  const merged = [...primary, ...cleanOverlap.filter((m) => !primary.includes(m))];
  if (merged.length) return merged;

  const anyOverlap = movies.filter((m) => overlaps(m, mood));
  return anyOverlap.length ? anyOverlap : movies;
}

/** Picks a random movie for a mood, avoiding the previous pick when there's
 *  more than one candidate (so hitting "Spin Again" doesn't just re-show
 *  the same title on a small pool). */
export function pickForMood(mood: Mood, movies: Movie[], avoidId?: string): Movie | null {
  const pool = moviesForMood(mood, movies);
  if (!pool.length) return null;
  const candidates = pool.length > 1 && avoidId ? pool.filter((m) => m.id !== avoidId) : pool;
  const list = candidates.length ? candidates : pool;
  return list[Math.floor(Math.random() * list.length)];
}
