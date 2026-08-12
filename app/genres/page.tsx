import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import BlogSection from "@/components/BlogSection";
import { getMovies, genresOf } from "@/lib/data";
import { backdrop, img } from "@/lib/images";
import type { Movie } from "@/lib/types";

export const metadata: Metadata = {
  title: "Genres",
  description: "Browse movies and shows by genre — action, comedy, drama, horror, K-drama, anime and every mood in between.",
};
export const dynamic = "force-dynamic";

/** The genre grid used to show the same generic stock-photo placeholder
 *  behind every tile — nothing about it actually looked like the genre it
 *  named, which is why it read as "dead". Each tile now uses the real
 *  backdrop of that genre's own most-popular title (falls back to a
 *  placeholder only if a genre genuinely has no artwork yet), so the tile
 *  itself previews the kind of thing you'll find behind it. */
function coverFor(g: string, movies: Movie[]): { src: string; count: number } {
  const inGenre = movies.filter((m) => m.genres.includes(g));
  const withArt = inGenre.filter((m) => m.backdropPath);
  const pick = (withArt.length ? withArt : inGenre)
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))[0];
  return { src: pick ? backdrop(pick, "w780") : img(`g-${g.toLowerCase()}`, 400, 240), count: inGenre.length };
}

export default async function GenresPage() {
  const movies = await getMovies();
  const genres = genresOf(movies);
  return (
    <div className="page">
      <div className="page__head"><h1>Genres</h1><p>Browse by mood and category — from action and drama to K-drama, anime and C-drama.</p></div>
      <div className="gtiles">
        {genres.map((g) => {
          const { src, count } = coverFor(g, movies);
          return (
            <Link className="gtile" key={g} href={`/movies?genre=${encodeURIComponent(g)}`}>
              <Image fill alt="" src={src} sizes="(max-width: 760px) 45vw, 220px" />
              <span>
                {g}
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
