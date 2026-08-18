import Link from "next/link";
import Image from "next/image";
import Icon from "../Icon";
import SearchBox from "../SearchBox";
import HeroActions from "./HeroActions";
import { poster } from "@/lib/images";
import type { Movie } from "@/lib/types";

/** The homepage hero: the site's promise, the two primary actions, search,
 *  and a small cinematic poster arrangement.
 *
 *  SERVER component on purpose. The headline, supporting line and the links
 *  are all in the initial HTML, so this is what Google indexes and what a
 *  visitor sees before any JavaScript runs. Only the two buttons need
 *  interactivity, and they live in a tiny client child (HeroActions).
 *
 *  The posters are passed in from the page's ONE shared trending fetch - the
 *  hero makes no request of its own, and nothing here varies per request, so
 *  the whole section caches as part of the page. */
export default function HomeHero({ posters }: { posters: Movie[] }) {
  const art = posters.slice(0, 3);

  return (
    <section className="hhero" aria-labelledby="hhero-h">
      <div className="hhero__glow" aria-hidden="true" />

      <div className="hhero__copy">
        <h1 id="hhero-h" className="hhero__h">
          What should you <span className="hhero__hl">watch tonight?</span>
        </h1>
        <p className="hhero__sub">
          Tell us the mood, how long you have and where you subscribe. We will find something
          worth watching and show you exactly where it is streaming.
        </p>

        <HeroActions />

        <div className="hhero__search">
          <SearchBox variant="page" placeholder="Search a title, actor or genre…" />
        </div>

        <p className="hhero__links">
          Or jump straight to{" "}
          <Link href="/movies">Movies</Link>,{" "}
          <Link href="/tv-shows">Series</Link>,{" "}
          <Link href="/trending">Trending</Link> or{" "}
          <Link href="/free-movies">Free Classics</Link>.
        </p>
      </div>

      {art.length > 0 && (
        <div className="hhero__art" aria-hidden="true">
          {art.map((m, i) => (
            <div key={m.id} className={`hhero__poster hhero__poster--${i}`}>
              <Image
                fill
                alt=""
                src={poster(m, "w342")}
                sizes="(max-width: 900px) 30vw, 220px"
                priority={i === 1}
              />
            </div>
          ))}
          <span className="hhero__badge"><Icon name="trend" size={12} /> Popular tonight</span>
        </div>
      )}
    </section>
  );
}
