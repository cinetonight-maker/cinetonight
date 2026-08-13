import Icon from "./Icon";
import type { Movie } from "@/lib/types";

/** The single, best-of-breed "Where to Watch" strip on a movie's detail
 *  page. Clicking it now does what it PROMISES: opens the platform's own
 *  search for this exact title in a new tab (it used to open our trailer
 *  player — a bait-and-switch that confused people and undercut the strip's
 *  whole purpose as affiliate real estate). rel includes "sponsored" so
 *  search engines read this as the commercial link it is — the honest
 *  labeling Google asks for on affiliate-style outbound links. */
const SEARCH_URLS: Record<string, (title: string) => string> = {
  Netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  "Prime Video": (t) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  JioHotstar: (t) => `https://www.hotstar.com/in/explore?search_query=${encodeURIComponent(t)}`,
  ZEE5: (t) => `https://www.zee5.com/search?q=${encodeURIComponent(t)}`,
  YouTube: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t} movie`)}`,
};

export default function PlatformStrip({
  movie, name, desc, color,
}: { movie: Pick<Movie, "id" | "title" | "trailerKey">; name: string; desc: string; color: string }) {
  const buildUrl = SEARCH_URLS[name] ?? ((t: string) => `https://www.google.com/search?q=${encodeURIComponent(`watch ${t} on ${name}`)}`);
  return (
    <a
      className="platstrip"
      href={buildUrl(movie.title)}
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
    >
      <span
        className="platstrip__logo"
        style={{
          background: `color-mix(in srgb,${color} 22%,#15151f)`,
          color,
          border: `1px solid color-mix(in srgb,${color} 50%,transparent)`,
        }}
      >
        {name[0]}
      </span>
      <span className="platstrip__body">
        <span className="platstrip__name">Watch on {name}</span>
        <span className="platstrip__desc">{desc}</span>
      </span>
      <span className="platstrip__cta"><Icon name="play" size={15} /> Watch Now</span>
    </a>
  );
}
