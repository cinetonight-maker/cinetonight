import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import BlogSection from "@/components/BlogSection";
import { getMovies, genresOf } from "@/lib/data";
import { canonicalGenre } from "@/lib/genres";
import { backdrop, img } from "@/lib/images";
import type { Movie } from "@/lib/types";

export const metadata: Metadata = {
  alternates: { canonical: "/genres" },
  title: "Genres",
  description: "Browse movies and shows by genre — action, comedy, drama, horror, K-drama, anime and every mood in between.",
};
// Cached (ISR): rendered once, reused for 3600s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 86400;

/** The genre grid used to show the same generic stock-photo placeholder
 *  behind every tile — nothing about it actually looked like the genre it
 *  named, which is why it read as "dead". Each tile now uses the real
 *  backdrop of that genre's own most-popular title (falls back to a
 *  placeholder only if a genre genuinely has no artwork yet), so the tile
 *  itself previews the kind of thing you'll find behind it. */
function coverFor(g: string, names: string[], movies: Movie[]): { src: string; count: number } {
  const inGenre = movies.filter((m) => m.genres.some((x) => names.includes(x)));
  const withArt = inGenre.filter((m) => m.backdropPath);
  const pick = (withArt.length ? withArt : inGenre)
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
  return { src: pick ? backdrop(pick, "w780") : img(`g-${g.toLowerCase()}`, 400, 240), count: inGenre.length };
}

/** Catalogue genre names folded onto the canonical browse genres that own the
 *  URLs (lib/genres.ts), so each genre gets exactly ONE tile pointing at
 *  exactly ONE address.
 *
 *  Before Phase 4A this grid linked every raw catalogue name, which meant both
 *  "Action" and TMDB's TV-side "Action & Adventure" got a tile — two tiles for
 *  one genre, and the second linked a URL that did not actually filter a movie
 *  query. A catalogue name that maps to no browse genre is dropped rather than
 *  linked, because its link could only ever land on the unfiltered hub. */
function genreTiles(movies: Movie[]): { label: string; names: string[] }[] {
  const byCanonical = new Map<string, string[]>();
  for (const raw of genresOf(movies)) {
    const canonical = canonicalGenre(raw);
    if (!canonical) continue;
    byCanonical.set(canonical, [...(byCanonical.get(canonical) ?? []), raw]);
  }
  return [...byCanonical.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, names]) => ({ label, names }));
}

export default async function GenresPage() {
  const movies = await getMovies();
  const genres = genreTiles(movies);
  return (
    <div className="page">
      <div className="page__head"><h1>Genres</h1><p>Browse by mood and category — from action and drama to K-drama, anime and C-drama.</p></div>
      <div className="gtiles">
        {genres.map(({ label, names }) => {
          const { src, count } = coverFor(label, names, movies);
          return (
            <Link className="gtile" key={label} href={`/movies?genre=${encodeURIComponent(label)}`}>
              <Image fill alt={`${label} movies and shows`} src={src} sizes="(max-width: 760px) 45vw, 220px" />
              <span>
                {label}
                <em>{count} title{count === 1 ? "" : "s"}</em>
              </span>
            </Link>
          );
        })}
      </div>
      <BlogSection count={3} />
    </div>
  );
}
