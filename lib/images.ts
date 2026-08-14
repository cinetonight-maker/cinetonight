import type { Movie } from "./types";

/**
 * Image sources.
 *
 * After `npm run sync`, titles carry TMDB `posterPath` / `backdropPath` and cast carry
 * `profilePath`, so real artwork is served from TMDB's CDN (no API key needed at runtime).
 * Anything without a path falls back to deterministic placeholder photography.
 */
const TMDB_IMG = "https://image.tmdb.org/t/p";

/** Deterministic placeholder (used when TMDB has no image for something). */
export function img(seed: string, w: number, h: number): string {
  // Branded local placeholders instead of picsum.photos: the external
  // service was slow/blocked for part of our audience (rendering as broken
  // images), and a random stock photo standing in for a cast face or
  // episode still reads as a bug anyway. Aspect ratio picks the artwork.
  void seed;
  const ratio = w / h;
  if (ratio > 1.2) return "/placeholder-wide.png";
  if (ratio >= 0.85) return "/placeholder-person.png";
  return "/placeholder-poster.png";
}

export function tmdb(path: string | null | undefined, size: string): string | null {
  return path ? `${TMDB_IMG}/${size}${path}` : null;
}

/** Portrait poster (2:3). */
export function poster(m: Pick<Movie, "id" | "posterPath">, size: "w342" | "w500" = "w342"): string {
  return tmdb(m.posterPath, size) ?? img(`p-${m.id}`, 300, 450);
}
export function posterLg(m: Pick<Movie, "id" | "posterPath">): string {
  return tmdb(m.posterPath, "w500") ?? img(`p-${m.id}`, 600, 900);
}

/** Wide backdrop (16:9). */
export function backdrop(m: Pick<Movie, "id" | "backdropPath">, size: "w780" | "w1280" = "w1280"): string {
  return tmdb(m.backdropPath, size) ?? img(`hero-${m.id}`, 1400, 600);
}

/** Hero-slide background — always that exact title's own art: its wide
 *  backdrop still (native fit for a full-bleed banner) first, falling back
 *  to its poster if no backdrop exists, then a placeholder as a last resort
 *  (never an unrelated stock photo when real art is available). */
export function heroArt(m: Pick<Movie, "id" | "posterPath" | "backdropPath">): string {
  return tmdb(m.backdropPath, "w1280") ?? tmdb(m.posterPath, "w780") ?? img(`hero-${m.id}`, 1400, 600);
}

/** Circular cast / person photo. */
export function profile(p: { name: string; profilePath?: string | null }): string {
  return tmdb(p.profilePath, "w185") ?? img(`person-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, 200, 200);
}
