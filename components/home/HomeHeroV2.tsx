import Link from "next/link";
import Image from "next/image";
import SearchBox from "../SearchBox";
import HeroActions from "./HeroActions";
import { poster } from "@/lib/images";
import type { Movie } from "@/lib/types";

/** V2 homepage hero (docs/V2-BUILD-PATH.md Phase 5, canvas Main/Mobile).
 *
 *  Same contract as HomeHero — SERVER component, headline + supporting line +
 *  primary actions + search all in the initial HTML, artwork fed from the
 *  page's ONE shared trending fetch (or the admin's Hero Slides), zero
 *  requests of its own. What changes is the right side: instead of three
 *  overlapping decorative posters, the SAME movie-card treatment used by
 *  every rail on the page, arranged as a fanned 3-card stack. The cards are
 *  real links — the hero starts the exploration instead of only decorating.
 *
 *  `badge` is computed by the page from where the art actually came from
 *  ("Featured tonight" for admin-chosen slides, "Popular tonight" for the
 *  trending fallback) so the label on the front card is always true. No
 *  "Tonight's Pick" wording here: the pick lives in PickStudio below, and
 *  calling a trending poster a pick would be inventing a recommendation. */
function highlightTail(text: string) {
  const words = text.trim().split(/\s+/);
  if (words.length < 3) return <span className="v2h-hl">{text}</span>;
  const head = words.slice(0, -2).join(" ");
  const tail = words.slice(-2).join(" ");
  return <>{head} <span className="v2h-hl">{tail}</span></>;
}

function meta(m: Movie): string {
  return [m.year > 0 ? String(m.year) : null, m.genres[0] ?? null, m.runtime || null]
    .filter(Boolean).join(" · ");
}

export default function HomeHeroV2({ posters, title, sub, badge }: {
  posters: Movie[]; title?: string; sub?: string; badge: string;
}) {
  const art = posters.slice(0, 3);
  const [front, left, right] = art;

  return (
    <section className="v2h" aria-labelledby="hhero-h">
      <div className="v2h-copy">
        <h1 id="hhero-h" className="v2h-h">
          {title
            ? highlightTail(title)
            : <>What should you <span className="v2h-hl">watch tonight?</span></>}
        </h1>
        <p className="v2h-sub">
          {sub ?? "Tell us the mood, how long you have and where you subscribe. We will find something worth watching and show you exactly where it is streaming."}
        </p>

        <HeroActions />

        <div className="v2h-search">
          <SearchBox variant="page" placeholder="Search a title, actor or genre…" />
        </div>

        <p className="v2h-links">
          Or jump straight to{" "}
          <Link href="/movies">Movies</Link>,{" "}
          <Link href="/tv-shows">Series</Link>,{" "}
          <Link href="/trending">Trending</Link> or{" "}
          <Link href="/free-movies">Free Classics</Link>.
        </p>
      </div>

      {front && (
        <div className="v2h-art">
          <span className="v2h-glow" aria-hidden="true" />
          {left && (
            <Link className="v2h-side v2h-side--l" href={`/movie/${left.id}`} aria-label={left.title}>
              <span className="v2h-frame">
                <Image fill alt="" src={poster(left, "w342")} sizes="(max-width: 900px) 26vw, 176px" />
                <span className="v2h-scrim" aria-hidden="true" />
                {left.rating > 0 && <span className="v2h-score">★ {left.rating.toFixed(1)}</span>}
              </span>
            </Link>
          )}
          {right && (
            <Link className="v2h-side v2h-side--r" href={`/movie/${right.id}`} aria-label={right.title}>
              <span className="v2h-frame">
                <Image fill alt="" src={poster(right, "w342")} sizes="(max-width: 900px) 26vw, 176px" />
                <span className="v2h-scrim" aria-hidden="true" />
                {right.rating > 0 && <span className="v2h-score">★ {right.rating.toFixed(1)}</span>}
              </span>
            </Link>
          )}
          <Link className="v2h-front" href={`/movie/${front.id}`}>
            <span className="v2h-frame v2h-frame--front">
              <Image fill alt="" src={poster(front, "w342")} sizes="(max-width: 900px) 34vw, 220px" priority />
              <span className="v2h-scrim" aria-hidden="true" />
              <span className="v2h-tag">{badge}</span>
              {front.rating > 0 && <span className="v2h-score v2h-score--r">★ {front.rating.toFixed(1)}</span>}
            </span>
            <span className="v2h-cap">
              <span className="v2h-cap-t">{front.title}</span>
              {meta(front) && <span className="v2h-cap-m">{meta(front)}</span>}
            </span>
          </Link>
        </div>
      )}
    </section>
  );
}
