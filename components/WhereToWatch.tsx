"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import type { WatchPayload } from "@/lib/watchRows";

/** "Where to Watch" — now a client island. The movie page is statically
 *  cached (ISR) for everyone; this component fetches the visitor's OWN
 *  country's availability from /api/watch after load. Crawlers don't run
 *  JS, so bot traffic never pays the availability cost. */
export default function WhereToWatch({ movie }: { movie: Pick<Movie, "id" | "tmdbId" | "kind" | "title"> }) {
  const [data, setData] = useState<WatchPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({
      id: movie.id, kind: movie.kind, title: movie.title,
      ...(movie.tmdbId != null ? { tmdbId: String(movie.tmdbId) } : {}),
    });
    fetch(`/api/watch?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.rows) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [movie.id, movie.kind, movie.title, movie.tmdbId]);

  if (!data) {
    return (
      <div className="w2w" aria-busy="true">
        <div className="w2w__head">Where to Watch</div>
        <div className="w2w__rows"><div className="w2w__row" style={{ opacity: 0.4 }}>
          <span className="w2w__body"><span className="w2w__name">Checking availability in your country…</span></span>
        </div></div>
      </div>
    );
  }

  const { rows, live, countryName, affiliate, searchLinks } = data;

  if (!live) {
    return (
      <div className="w2w">
        <div className="w2w__head">
          Where to Watch in <span className="w2w__country">{countryName}</span>
        </div>
        <p className="w2w__unknown">
          We couldn&apos;t confirm streaming availability for this title in {countryName} yet.
          It may be on a platform our data doesn&apos;t track, or on its channel&apos;s official YouTube.
        </p>
        <div className="w2w__searches">
          {searchLinks.map((l) => (
            <a key={l.url} className="w2w__searchbtn" href={l.url} target="_blank" rel="noopener noreferrer nofollow">
              <span className="w2w__searchlabel">{l.label}</span>
              <span className="w2w__searchnote">{l.note}</span>
            </a>
          ))}
        </div>
        <div className="w2w__note">Availability data by JustWatch via TMDB. We only show platforms confirmed to carry a title.</div>
      </div>
    );
  }

  return (
    <div className="w2w">
      <div className="w2w__head">
        Where to Watch in <span className="w2w__country">{countryName}</span>
      </div>
      <div className="w2w__rows">
        {rows.map((o) => (
          <a
            key={o.key}
            className="w2w__row"
            href={o.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            style={{ borderColor: `color-mix(in srgb, ${o.color} 30%, var(--line))` }}
          >
            <span className="w2w__logo">
              {o.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- tiny brand image
                <img src={o.logo} alt={`${o.name} logo`} loading="lazy" />
              ) : (
                <span className="w2w__mono" style={{ background: `color-mix(in srgb, ${o.color} 24%, #15151f)`, color: o.color, border: `1px solid color-mix(in srgb, ${o.color} 55%, transparent)` }}>
                  {o.monogram}
                </span>
              )}
            </span>
            <span className="w2w__body">
              <span className="w2w__name">{o.name}</span>
              <span className="w2w__benefit">{o.benefit}</span>
            </span>
            <span className="w2w__cta" style={{ background: o.color }}>
              <Icon name="play" size={13} /> {o.cta}
            </span>
          </a>
        ))}
      </div>
      <div className="w2w__note">
        Availability may vary by region and plan. Streaming data by JustWatch via TMDB.
        {affiliate && " Some links are affiliate links, and we may earn a commission at no extra cost to you."}
      </div>
    </div>
  );
}
