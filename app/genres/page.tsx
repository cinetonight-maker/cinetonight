import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { getMovies, genresOf } from "@/lib/data";
import { img } from "@/lib/images";

export const metadata: Metadata = {
  title: "Genres",
  description: "Browse movies and shows by genre — action, comedy, drama, horror and every mood in between.",
};
export const dynamic = "force-dynamic";

export default async function GenresPage() {
  const movies = await getMovies();
  const genres = genresOf(movies);
  return (
    <div className="page">
      <div className="page__head"><h1>Genres</h1><p>Browse by mood and category.</p></div>
      <div className="gtiles">
        {genres.map((g) => (
          <Link className="gtile" key={g} href={`/movies?genre=${encodeURIComponent(g)}`}>
            <Image fill alt="" src={img(`g-${g.toLowerCase()}`, 400, 240)} sizes="(max-width: 760px) 45vw, 220px" />
            <span>{g}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
