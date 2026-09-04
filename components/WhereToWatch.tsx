"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { Movie } from "@/lib/types";
import type { WatchPayload } from "@/lib/watchRows";
import { trackProviderClicked, toMediaType, type Surface } from "@/lib/analytics";

/** Rows shown before the "Show more" toggle. Defined HERE, not imported from
 *  lib/watchRows: that module is `server-only`, so importing a value from it
 *  into this client component would poison the browser bundle. */
const VISIBLE_ROWS = 3;

/** "Where to Watch" — a client island over a server-rendered starting state.
 *
 *  The movie page is statically cached (ISR) for everyone, so it cannot know
 *  the visitor's country. It therefore renders ONE fixed region's rows into
 *  the cached HTML (see SSR_WATCH_REGION in app/movie/[id]/page.tsx) and
 *  passes them in as `initial`. This component paints those immediately, then
 *  fetches /api/watch and swaps in the visitor's OWN country.
 *
 *  Why the server half exists at all: /api/watch is robots-disallowed, so a
 *  crawler renders the page, cannot make the call, and used to index
 *  "Checking availability in your country...". The initial rows are the only
 *  version a crawler ever sees. Real browsers still get their own region, and
 *  bot traffic still never pays the per-request availability cost. */
export default function WhereToWatch({ movie, surface = "unknown", initial = null }: {
  movie: Pick<Movie, "id" | "tmdbId" | "kind" | "title">;
  surface?: Surface;
  /** Server-rendered availability for the default SSR region. Present in the
   *  cached HTML so the panel ships real platform names instead of a spinner,
   *  which is the ONLY version a crawler ever sees. Replaced below with the
   *  visitor's own country once the client resolves it. */
  initial?: WatchPayload | null;
}) {
  const [data, setData] = useState<WatchPayload | null>(initial);
  const [expanded, setExpanded] = useState(false);

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

  // Only reachable when the server had nothing either (no TMDB data, or the
  // fetch threw). With `initial` set this branch never renders, so the first
  // paint - and the crawled HTML - carries real rows.
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

  const { rows, live, countryName, affiliate, searchLinks, fallbackRegion } = data;

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
            <a key={l.url} className="w2w__searchbtn" href={l.url} target="_blank" rel="noopener noreferrer nofollow"
              onClick={() => trackProviderClicked({
                provider: l.label.toLowerCase().includes("youtube") ? "youtube_search" : "web_search",
                surface, media_type: toMediaType(movie.kind), tmdb_id: movie.tmdbId ?? undefined,
              })}>
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
      {fallbackRegion && (
        <p className="w2w__fallback">
          Not confirmed for your country yet — showing where it streams in {countryName}.
          Availability in your region may differ.
        </p>
      )}
      <div className="w2w__rows">
        {rows.map((o, i) => (
          <a
            key={o.key}
            // Rows past the third are IN THE DOM but hidden until the toggle
            // is pressed. Rendering then hiding (rather than not rendering)
            // is deliberate: the crawler reads every confirmed platform while
            // the reader still gets a three-row panel.
            className={`w2w__row${i >= VISIBLE_ROWS && !expanded ? " w2w__row--hidden" : ""}`}
            hidden={i >= VISIBLE_ROWS && !expanded}
            href={o.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            style={{ borderColor: `color-mix(in srgb, ${o.color} 30%, var(--line))` }}
            // Watch-intent event, fired on the CLICK only (never on render),
            // and never blocking the navigation - the tab opens regardless.
            onClick={() => trackProviderClicked({
              provider: o.key, surface, media_type: toMediaType(movie.kind), tmdb_id: movie.tmdbId ?? undefined,
            })}
          >
            <span className={`w2w__logo${o.squareLogo ? " w2w__logo--sq" : ""}`}>
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
      {rows.length > VISIBLE_ROWS && !expanded && (
        <button type="button" className="w2w__more" onClick={() => setExpanded(true)}>
          Show {rows.length - VISIBLE_ROWS} more {rows.length - VISIBLE_ROWS === 1 ? "option" : "options"}
        </button>
      )}
      <div className="w2w__note">
        Availability may vary by region and plan. Streaming data by JustWatch via TMDB.
        {affiliate && " Some links are affiliate links, and we may earn a commission at no extra cost to you."}
      </div>
    </div>
  );
}
