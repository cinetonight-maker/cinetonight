import Link from "next/link";
import { CHANNELS } from "@/lib/channels";
import { channelLogoUrl } from "@/lib/channelLogoManifest";

/** Browse by streaming service.
 *
 *  ZERO data fetching, by design. The previous homepage rendered a "rich"
 *  card per platform, and each one made its own TMDB call for a decorative
 *  poster fan - 8 API calls and 8 cache entries every render, for artwork
 *  nobody clicked. This is the same journey (pick a platform, see what is on
 *  it) built from static configuration plus a self-hosted logo, and the real
 *  content lives one click away on the channel page where it belongs.
 *
 *  Only platforms CineTonight actually supports appear here - the list comes
 *  from lib/channels.ts, never invented. */
export default function StreamingRow({ limit = 8 }: { limit?: number }) {
  const channels = CHANNELS.slice(0, limit);

  return (
    <section className="sec" aria-labelledby="streaming-h">
      <div className="sec__head">
        <div className="sec__titles">
          <h2 id="streaming-h">Browse by Streaming Service</h2>
          <p className="sec__sub">See what is worth watching on the services you already pay for</p>
        </div>
        <Link className="sec__all" href="/genres">All platforms</Link>
      </div>

      <ul className="svcrow">
        {channels.map((c) => {
          const logo = channelLogoUrl(c.logoFile);
          return (
            <li key={c.slug}>
              <Link
                className="svc"
                href={`/channel/${c.slug}`}
                style={{ borderColor: `color-mix(in srgb, ${c.color} 32%, var(--line))` }}
              >
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand asset, often SVG
                  <img
                    className="svc__logo"
                    src={logo}
                    alt=""
                    loading="lazy"
                    style={c.logoInvert ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
                  />
                ) : (
                  <span className="svc__badge" style={{ color: c.color }}>{c.name[0]}</span>
                )}
                <span className="svc__name">{c.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
