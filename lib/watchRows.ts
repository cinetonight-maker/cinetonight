import "server-only";
import { channelBySlug, type Channel } from "@/lib/channels";
import { watchProvidersTmdb, parseTmdbId, tmdbConfigured, type WatchProvider } from "@/lib/tmdb";
import { regionName } from "@/lib/region";
import type { MovieKind } from "@/lib/types";

/** Server-side "Where to Watch" row builder — extracted from the old
 *  server component so the movie PAGE can be statically cached (ISR)
 *  while per-visitor availability is fetched client-side via
 *  /api/watch. Bots never execute JS, so they never trigger this. */

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

export interface Row {
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
    // Curated self-hosted brand logo first; otherwise TMDB ships an official
    // logo for every provider it lists (p.logoPath) — so no platform ever
    // renders as a bare letter. Monogram remains only as a last-resort net.
    logo: channel?.logoFile
      ? `/channel-logos/${channel.logoFile}`
      : p.logoPath ? `https://image.tmdb.org/t/p/w92${p.logoPath}` : undefined,
    color: channel?.color ?? "#8b5cf6",
    monogram: channel?.logoFile || p.logoPath ? undefined : name[0],
    benefit: isPrime && AMAZON_TAG
      ? "Streaming now, and new members get a 30-day free trial"
      : streaming ? "Included with subscription, watch instantly" : "Rent or buy, no subscription needed",
    cta: isPrime && AMAZON_TAG ? "Start Free Trial" : streaming ? "Watch Now" : "Rent or Buy",
    url: isPrime && AMAZON_TAG
      ? `https://www.amazon.in/amazonprime?tag=${encodeURIComponent(AMAZON_TAG)}`
      : buildUrl(title),
  };
}



export interface WatchPayload {
  rows: Row[];
  live: boolean;
  region: string;
  countryName: string;
  affiliate: boolean;
  searchLinks: { label: string; url: string; note: string }[];
}

export async function buildWatch(
  id: string, tmdbId: string | number | null | undefined,
  kind: MovieKind, title: string, region: string
): Promise<WatchPayload> {
  const parsed = parseTmdbId(id);
  const tmdbRef = parsed?.id ?? (tmdbId != null ? String(tmdbId) : null);
  const k = parsed?.kind ?? kind;

  let providers: WatchProvider[] = [];
  if (tmdbRef && tmdbConfigured) {
    try { providers = await watchProvidersTmdb(k, tmdbRef, region); } catch { providers = []; }
  }

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
    .map(([slug, p]) => buildRow(p, slug, title));
  const unknownRows = unknown
    .sort((a, b) => ACCESS_RANK[a.access] - ACCESS_RANK[b.access])
    .slice(0, 2)
    .map((p) => buildRow(p, undefined, title));

  const live = knownRows.length + unknownRows.length > 0;
  // NO fabricated rows when data is missing: a "Watch Now on Netflix"
  // button for a title Netflix doesn't carry is a lie, and this panel's
  // whole value is trust. Unconfirmed titles get honest SEARCH links
  // instead (YouTube first: Pakistani and many regional dramas stream
  // free on their channels' official YouTube uploads).
  const rows = live ? [...knownRows, ...unknownRows].slice(0, 6) : [];
  return {
    rows, live, region, countryName: regionName(region), affiliate: !!AMAZON_TAG,
    searchLinks: live ? [] : [
      { label: "Search on YouTube", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " episode 1")}`, note: "Many dramas stream free on official channels" },
      { label: "Search the web", url: `https://www.google.com/search?q=${encodeURIComponent(`watch ${title} online`)}`, note: "Find where it officially streams" },
    ],
  };
}
