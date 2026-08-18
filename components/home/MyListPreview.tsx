"use client";

import Link from "next/link";
import Image from "next/image";
import Icon from "../Icon";
import { useWatchlist } from "@/lib/watchlist";
import { poster } from "@/lib/images";
import type { CardMovie } from "@/lib/types";

/** A small "come back to this" block for saved titles.
 *
 *  CACHE SAFETY - the important part: the watchlist is read on the CLIENT,
 *  from the existing useWatchlist hook. Nothing personal is read during server
 *  rendering, so the homepage HTML stays identical for every visitor and
 *  remains one shared cache entry. Personalising it at render time would have
 *  meant a cache entry per user, which is exactly the pattern that made this
 *  site expensive in the first place.
 *
 *  Titles are matched against the catalogue the page already loaded. Anything
 *  saved from a live TMDB row that is not in that list simply is not shown
 *  here - the full My List page resolves those properly, and this block links
 *  straight to it. */
export default function MyListPreview({ movies }: { movies: CardMovie[] }) {
  const { ids } = useWatchlist();

  const saved = ids
    .map((id) => movies.find((m) => m.id === id))
    .filter(Boolean)
    .slice(0, 4) as CardMovie[];

  if (!ids.length) {
    return (
      <section className="mlp mlp--empty" aria-labelledby="mylist-h">
        <div>
          <h2 id="mylist-h" className="mlp__h"><Icon name="bookmark" size={16} /> Build your watchlist</h2>
          <p className="mlp__sub">
            Save anything you are not watching tonight and it will be waiting here next time.
          </p>
        </div>
        <Link className="mlp__cta" href="/movies">Find something to save</Link>
      </section>
    );
  }

  return (
    <section className="mlp" aria-labelledby="mylist-h">
      <div className="mlp__head">
        <h2 id="mylist-h" className="mlp__h"><Icon name="bookmark" size={16} /> Waiting in My List</h2>
        <Link className="sec__all" href="/my-list">Go to My List</Link>
      </div>

      {saved.length > 0 ? (
        <ul className="mlp__row">
          {saved.map((m) => (
            <li key={m.id}>
              <Link className="mlp__item" href={`/movie/${m.id}`}>
                <span className="mlp__poster">
                  <Image fill alt="" src={poster(m, "w342")} sizes="64px" />
                </span>
                <span className="mlp__meta">
                  <span className="mlp__t">{m.title}</span>
                  {m.year > 0 && <span className="mlp__y">{m.year}</span>}
                </span>
                <Icon name="chevr" size={15} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mlp__sub">
          You have {ids.length} saved title{ids.length === 1 ? "" : "s"}.{" "}
          <Link href="/my-list">Open My List</Link> to see them.
        </p>
      )}
    </section>
  );
}
