import type { Movie } from "./types";

/** Mood → genre mapping for the "Mood Roulette" picker (components/MoodRoulette.tsx).
 *  Genres here are matched against Movie.genres, which come straight from TMDB
 *  (see the distinct list in content/movies.json) — kept intentionally loose
 *  (multiple genres per mood, OR'd) so every mood has something to land on
 *  even on a small catalogue. "surprise" has no genre filter at all — it's
 *  a true random spin across everything. */
export interface Mood {
  id: string;
  label: string;
  emoji: string;
  genres: string[];
}

export const MOODS: Mood[] = [
  { id: "heartbreak", label: "Heartbreak", emoji: "\u{1F494}", genres: ["Romance", "Drama"] },
  { id: "adrenaline", label: "Adrenaline Rush", emoji: "⚡", genres: ["Action", "Action & Adventure", "Thriller"] },
  { id: "laugh", label: "Laugh Out Loud", emoji: "\u{1F602}", genres: ["Comedy"] },
  { id: "chills", label: "Spine-Chiller", emoji: "\u{1F47B}", genres: ["Horror", "Thriller"] },
  { id: "epic", label: "Epic Journey", emoji: "\u{1F5FA}️", genres: ["Adventure", "Fantasy", "History"] },
  { id: "mindbender", label: "Mind Bender", emoji: "\u{1F9E0}", genres: ["Crime", "Thriller", "Drama"] },
  { id: "feelgood", label: "Feel Good", emoji: "☀️", genres: ["Comedy", "Romance", "Adventure"] },
  { id: "surprise", label: "Surprise Me", emoji: "\u{1F3B2}", genres: [] },
];

/** Movies matching a mood's genres (any overlap counts). Falls back to the
 *  full catalogue if nothing matches, so a thin genre spread never dead-ends
 *  the picker with an empty result. */
export function moviesForMood(mood: Mood, movies: Movie[]): Movie[] {
  if (!mood.genres.length) return movies;
  const matched = movies.filter((m) => m.genres.some((g) => mood.genres.includes(g)));
  return matched.length ? matched : movies;
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
