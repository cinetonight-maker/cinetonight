import Link from "next/link";
import type { Metadata } from "next";
import { GENRES } from "@/lib/data";
import { img } from "@/lib/images";

export const metadata: Metadata = { title: "Genres" };

export default function GenresPage() {
  return (
    <div className="page">
      <div className="page__head"><h1>Genres</h1><p>Browse by mood and category.</p></div>
      <div className="gtiles">
        {GENRES.map((g) => (
          <Link className="gtile" key={g} href={`/movies?genre=${encodeURIComponent(g)}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" alt="" src={img(`g-${g.toLowerCase()}`, 400, 240)} />
            <span>{g}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
