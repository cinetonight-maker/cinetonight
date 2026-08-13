import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import Row from "./Row";
import { getClassicsEnriched } from "@/lib/classics";

/** Homepage rail for the Free Classics shelf — poster cards that link to
 *  /free-movies/<slug> watch pages (NOT /movie/..., so the standard
 *  MovieCard can't be reused here). Renders nothing while the shelf is
 *  empty, so the section simply appears once classics are published. */
export default async function ClassicsRow() {
  const classics = await getClassicsEnriched(8);
  if (!classics.length) return null;

  return (
    <Row
      title="Free Classics"
      sub="Full movies you can watch right now — free & 100% legal"
      all={<Link className="sec__all" href="/free-movies">View All</Link>}
    >
      {classics.map(({ classic, movie, posterUrl }) => (
        <Link key={classic.slug} className="fmc fmc--rail" href={`/free-movies/${classic.slug}`}>
          <div className="fmc__poster">
            <Image fill alt={`${classic.title} (${classic.year}) poster`} src={posterUrl} sizes="170px" />
            <span className="fmc__badge">FREE</span>
            <span className="fmc__play"><Icon name="play" size={18} /></span>
          </div>
          <div className="fmc__t">{classic.title}</div>
          <div className="fmc__m">
            {[classic.year, movie ? `★ ${movie.rating.toFixed(1)}` : classic.genre].filter(Boolean).join(" · ")}
          </div>
        </Link>
      ))}
    </Row>
  );
}
