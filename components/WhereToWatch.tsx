import Icon from "./Icon";
import { channelBySlug, type Channel } from "@/lib/channels";
import { watchProvidersTmdb, parseTmdbId, tmdbConfigured, type WatchProvider } from "@/lib/tmdb";
import { visitorRegion, regionName } from "@/lib/region";
import type { Movie } from "@/lib/types";

/** "Where to Watch in India" — LIVE per-title availability from TMDB's
 *  watch/providers data (sourced from JustWatch; attributed in the footer
 *  note, per TMDB's terms). Only platforms that actually carry THIS title
 *  render, streaming first, then rent/buy. Every row deep-links to the
 *  platform's own search for the exact title, so a signed-in user lands
 *  one tap from playing it. */

/** Amazon Associates tag (e.g. "cinetonight-21"). Set AMAZON_ASSOCIATES_TAG in
 *  .env.local + Vercel once approved — the Prime row then links to the
 *  Prime signup page WITH your tag (the free-trial bounty page) and the
 *  disclosure line appears automatically. */
const AMAZON_TAG = process.env.AMAZON_ASSOCIATES_TAG?.trim();

/** TMDB provider id → our channel slug. TMDB models one real-world service
 *  as MANY provider entries — subscription, "with ads" tier, the rent/buy
 *  store ("Amazon Video" id 10 is Prime's store side!), Amazon/Apple
 *  sub-channels, merged legacy brands (JioCinema → JioHotstar) — so this
 *  map is deliberately generous: every variant lands on the ONE brand row
 *  users actually recognize, with its real logo. */
const PROVIDER_TO_SLUG: Record<number, string> = {
  // Netflix (+ Kids, + ad tier)
  8: "netflix", 175: "netflix", 1796: "netflix",
  // Amazon: Prime subscription, ad tier, legacy id, and the "Amazon Video" rent/buy store
  9: "prime-video", 10: "prime-video", 119: "prime-video", 2100: "prime-video",
  // JioHotstar (+ legacy Hotstar and merged JioCinema)
  122: "jiohotstar", 970: "jiohotstar", 2336: "jiohotstar",
  // Apple: TV+ subscription and the Apple TV store
  2: "apple-tv", 350: "apple-tv", 2243: "apple-tv",
  232: "zee5",
  237: "sony-liv", 2180: "sony-liv",
  283: "crunchyroll", 1968: "crunchyroll",
  344: "viki",
  309: "sun-nxt",
  315: "hoichoi", 2176: "hoichoi",
  474: "shemaroo-me",
  561: "lionsgate-play", 2074: "lionsgate-play", 2053: "lionsgate-play", 2358: "lionsgate-play",
  // Google Play Movies is DEAD (Google moved film purchases to YouTube),
  // but TMDB still emits provider id 3 — fold it into the YouTube row so
  // users land somewhere that actually works instead of an empty store.
  3: "youtube",
  192: "youtube",
  515: "mx-player", 1898: "mx-player",
  532: "aha",
};

/** Title-search deep link per platform — closest public equivalent of
 *  landing on the exact movie (signed-in users are one tap from play). */
const SEARCH_URLS: Record<string, (t: string) => string> = {
  netflix: (t) => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  "prime-video": (t) => `https://www.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  jiohotstar: (t) => `https://www.hotstar.com/in/search?q=${encodeURIComponent(t)}`,
  "apple-tv": (t) => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  zee5: (t) => `https://www.zee5.com/search?q=${encodeURIComponent(t)}`,
  "sony-liv": (t) => `https://www.sonyliv.com/search?searchTerm=${encodeURIComponent(t)}`,
  crunchyroll: (t) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(t)}`,
  viki: (t) => `https://www.viki.com/search?q=${encodeURIComponent(t)}`,
  // sp=EgIQBA%3D%3D = YouTube's "type: Movie" results filter — returns the
  // actual purchasable film, not random uploads about it.
  youtube: (t) => `https://www.youtube.com/results?search_query=${encodeURIComponent(t)}&sp=EgIQBA%3D%3D`,
  "mx-player": (t) => `https://www.mxplayer.in/search?q=${encodeURIComponent(t)}`,
};
const fallbackSearch = (platform: string) => (t: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`watch ${t} on ${platform}`)}`;

const ACCESS_RANK: Record<WatchProvider["access"], number> = { stream: 0, rent: 1, buy: 2 };

interface Row {
  key: string;
  name: string;
  logo?: string;
  color: string;
  monogram?: string;
  benefit: string;
  cta: string;
  url: string;
}

function buildRow(p: WatchProvider, slug: string | undefined, title: string): Row {
  const channel: Channel | undefined = slug ? channelBySlug(slug) : undefined;
  const name = channel?.name ?? p.name;
  const buildUrl = (slug && SEARCH_URLS[slug]) || fallbackSearch(name);
  const streaming = p.access === "stream";
  const isPrime = slug === "prime-video";
  return {
    key: slug ?? `p-${p.providerId}`,
    name,
    logo: channel?.logoFile ? `/channel-logos/${channel.logoFile}` : undefined,
    color: channel?.color ?? "#8b5cf6",
    monogram: channel?.logoFile ? undefined : name[0],
    benefit: isPrime && AMAZON_TAG
      ? "Streaming now — new members get a 30-day free trial"
      : streaming ? "Included with subscription — watch instantly" : "Rent or buy — no subscription needed",
    cta: isPrime && AMAZON_TAG ? "Start Free Trial" : streaming ? "Watch Now" : "Rent / Buy",
    url: isPrime && AMAZON_TAG
      ? `https://www.amazon.in/amazonprime?tag=${encodeURIComponent(AMAZON_TAG)}`
      : buildUrl(title),
  };
}

/** Generic panel for titles TMDB has no availability data for — better
 *  than an empty section, clearly labeled as not title-specific. */
const FALLBACK_ROWS = (title: string): Row[] => [
  { key: "prime", name: "Amazon Prime Video", logo: "/channel-logos/prime-video.svg", color: "#00a8e1", benefit: "30-day free trial for new members — then cancel anytime", cta: AMAZON_TAG ? "Start Free Trial" : "Watch Now", url: AMAZON_TAG ? `https://www.amazon.in/amazonprime?tag=${encodeURIComponent(AMAZON_TAG)}` : SEARCH_URLS["prime-video"](title) },
  { key: "netflix", name: "Netflix", logo: "/channel-logos/netflix.svg", color: "#e50914", benefit: "Stream instantly in HD", cta: "Watch Now", url: SEARCH_URLS.netflix(title) },
  { key: "jiohotstar", name: "JioHotstar", logo: "/channel-logos/jiohotstar.svg", color: "#1f80e0", benefit: "Blockbusters, originals & live cricket in one plan", cta: "Watch Now", url: SEARCH_URLS.jiohotstar(title) },
];

export default async function WhereToWatch({ movie }: { movie: Movie }) {
  const parsed = parseTmdbId(movie.id);
  const tmdbRef = parsed?.id ?? (movie.tmdbId != null ? String(movie.tmdbId) : null);
  const kind = parsed?.kind ?? movie.kind;

  // Per-VISITOR region: on Vercel every request carries the visitor's
  // country (x-vercel-ip-country), so an Indian visitor gets India's
  // availability and a Pakistani visitor gets Pakistan's — geo-blocked
  // platforms (e.g. JioHotstar outside India) simply never render for
  // people who can't use them. Local dev has no geo header, so set
  // NEXT_PUBLIC_DEFAULT_REGION in .env.local (e.g. PK) to test your own
  // country's view; the final fallback is IN, the site's primary market.
  const region = await visitorRegion();
  const countryName = regionName(region);

  let providers: WatchProvider[] = [];
  if (tmdbRef && tmdbConfigured) {
    try { providers = await watchProvidersTmdb(kind, tmdbRef, region); } catch { providers = []; }
  }

  // Collapse TMDB's many provider variants into one row per BRAND: known
  // channels dedupe by slug (best access wins — a title both streamable
  // and rentable on Amazon shows once, as streamable). Recognized brands
  // render first; unknown providers are kept to at most two so a long
  // tail of obscure services never buries the platforms people have.
  const bySlug = new Map<string, WatchProvider>();
  const unknown: WatchProvider[] = [];
  for (const p of providers) {
    const slug = PROVIDER_TO_SLUG[p.providerId];
    if (slug) {
      const cur = bySlug.get(slug);
      if (!cur || ACCESS_RANK[p.access] < ACCESS_RANK[cur.access]) bySlug.set(slug, p);
    } else {
      unknown.push(p);
    }
  }
  const knownRows = [...bySlug.entries()]
    .sort((a, b) => ACCESS_RANK[a[1].access] - ACCESS_RANK[b[1].access])
    .map(([slug, p]) => buildRow(p, slug, movie.title));
  const unknownRows = unknown
    .sort((a, b) => ACCESS_RANK[a.access] - ACCESS_RANK[b.access])
    .slice(0, 2)
    .map((p) => buildRow(p, undefined, movie.title));

  const live = knownRows.length + unknownRows.length > 0;
  // Region-aware fallback: Netflix + Prime are near-global; JioHotstar
  // only makes sense for Indian visitors.
  const fallback = FALLBACK_ROWS(movie.title).filter((r) => r.key !== "jiohotstar" || region === "IN");
  const rows = live ? [...knownRows, ...unknownRows].slice(0, 6) : fallback;

  return (
    <div className="w2w">
      <div className="w2w__head">
        Where to Watch in <span className="w2w__country">{countryName}</span>
      </div>
      {!live && (
        <p className="w2w__unknown">
          Live availability isn&apos;t tracked for this title yet — try these popular platforms:
        </p>
      )}
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
                // eslint-disable-next-line @next/next/no-img-element -- tiny self-hosted brand SVG
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
        {AMAZON_TAG && " Some links are affiliate links — we may earn a commission, at no extra cost to you."}
      </div>
    </div>
  );
}
