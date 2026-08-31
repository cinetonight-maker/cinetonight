import "server-only";
import { channelBySlug, type Channel } from "@/lib/channels";
import { watchProvidersWithFallback, parseTmdbId, tmdbConfigured, type WatchProvider } from "@/lib/tmdb";
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

/** How many confirmed platforms we keep at all. Beyond this the tail is
 *  store links nobody uses, and every extra row is bytes in every cached
 *  page. */
const MAX_ROWS = 8;
// NOTE: how many rows the panel SHOWS before its "Show more" toggle lives in
// components/WhereToWatch.tsx, not here. This module is `server-only`, so a
// client component importing a value from it poisons the browser bundle -
// only `import type` is safe across that boundary.

export interface Row {
  key: string;
  name: string;
  logo?: string;
  /** Square app-icon art (TMDB) rather than a wide wordmark (curated). */
  squareLogo?: boolean;
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
  // The free-trial affiliate treatment applies ONLY when the title actually
  // STREAMS on Prime. TMDB reports the Amazon rent/buy store on almost every
  // film, and it folds into this same row - so without the `streaming` guard
  // nearly every movie on the site showed a "Start Free Trial" Prime strip
  // for a title Prime doesn't even include with the subscription.
  const isPrime = slug === "prime-video" && streaming;
  return {
    key: slug ?? `p-${p.providerId}`,
    name,
    // TMDB provider art is SQUARE app-icon style; our curated files are wide
    // wordmarks. The strip needs to know which shape it is rendering - a
    // square icon stretched into the wide logo box is what made unknown
    // platforms (HBO Max etc.) look broken.
    squareLogo: !channel?.logoFile && !!p.logoPath,
    // Curated self-hosted brand logo first; otherwise TMDB ships an official
    // logo for every provider it lists (p.logoPath) — so no platform ever
    // renders as a bare letter. Monogram remains only as a last-resort net.
    logo: channel?.logoFile
      ? `/channel-logos/${channel.logoFile}`
      : p.logoPath ? `https://image.tmdb.org/t/p/w92${p.logoPath}` : undefined,
    color: channel?.color ?? "#8b5cf6",
    monogram: channel?.logoFile || p.logoPath ? undefined : name[0],
    // The CTA is always about WATCHING the title - never a signup pitch.
    // The 30-day trial is mentioned in the benefit line only, and the button
    // links to the title itself, because a "Start Free Trial" button that
    // lands on Amazon's signup page instead of the movie reads as an ad and
    // costs the panel its trust.
    benefit: isPrime && AMAZON_TAG
      ? "Included with Prime - new members get a 30-day free trial"
      : streaming ? "Included with subscription, watch instantly" : "Rent or buy, no subscription needed",
    cta: streaming ? "Watch Now" : "Rent or Buy",
    url: buildUrl(title),
  };
}



export interface WatchPayload {
  rows: Row[];
  live: boolean;
  region: string;
  countryName: string;
  affiliate: boolean;
  /** True when the rows come from a DIFFERENT country than the visitor's
   *  own (their country had no confirmed data). The UI must say so. */
  fallbackRegion?: boolean;
  searchLinks: { label: string; url: string; note: string }[];
}

export async function buildWatch(
  id: string, tmdbId: string | number | null | undefined,
  kind: MovieKind, title: string, region: string,
  /** Set by the SERVER-RENDERED call on /movie/[id] so the providers fetch
   *  uses the 3-day TTL and cannot shorten that page's revalidate window.
   *  The /api/watch route leaves it off and keeps the normal 24h data. */
  opts: { longTtl?: boolean } = {}
): Promise<WatchPayload> {
  const parsed = parseTmdbId(id);
  const tmdbRef = parsed?.id ?? (tmdbId != null ? String(tmdbId) : null);
  const k = parsed?.kind ?? kind;

  // Region FALLBACK, not a hard lookup: the visitor's country first, then
  // IN -> US -> GB -> any country with data. The old hard lookup returned
  // nothing whenever the visitor's exact country had no rows, which is why
  // this panel so often showed only the YouTube/web search links. The region
  // that actually supplied the rows comes back with them, so the heading
  // stays honest about WHERE the title is confirmed streaming.
  let providers: WatchProvider[] = [];
  let usedRegion = region;
  if (tmdbRef && tmdbConfigured) {
    try {
      const r = await watchProvidersWithFallback(k, tmdbRef, region, { longTtl: opts.longTtl });
      providers = r.providers;
      if (providers.length) usedRegion = r.region;
    } catch { providers = []; }
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
  // PRIME FIRST, among the providers that genuinely carry the title.
  // This is an ORDERING preference over real rows, never an injected one:
  // if Prime neither streams nor sells this title it still does not appear.
  // Access rank still dominates, so a Prime rent row can never outrank a
  // watch-with-subscription row on another platform - only a Prime STREAM
  // row is promoted, which is the same condition the affiliate treatment
  // in buildRow() already uses.
  const primeFirst = (slug: string, p: WatchProvider) =>
    slug === "prime-video" && p.access === "stream" ? -1 : 0;
  const knownRows = [...bySlug.entries()]
    .sort((a, b) =>
      (ACCESS_RANK[a[1].access] + primeFirst(a[0], a[1])) -
      (ACCESS_RANK[b[1].access] + primeFirst(b[0], b[1])))
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
  // THREE rows VISIBLE, best first - the rest are kept and revealed behind
  // a "Show more" toggle in the UI (see VISIBLE_ROWS in WhereToWatch).
  //
  // Why keep them at all now: a six-row wall was decision fatigue, which is
  // what the old hard slice(0, 3) removed. But discarding the extras also
  // hid them from the SERVER-RENDERED HTML, and that HTML is the only thing
  // a crawler ever reads - the panel is a client island, so Googlebot never
  // fetches /api/watch (it is robots-disallowed). Collapsed-but-present is
  // ordinary progressive disclosure: the reader still sees three, the
  // crawler sees every confirmed platform.
  const rows = live ? [...knownRows, ...unknownRows].slice(0, MAX_ROWS) : [];
  return {
    rows, live, region: usedRegion, countryName: regionName(usedRegion), affiliate: !!AMAZON_TAG,
    fallbackRegion: usedRegion !== region,
    searchLinks: live ? [] : [
      { label: "Search on YouTube", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(title + " episode 1")}`, note: "Many dramas stream free on official channels" },
      { label: "Search the web", url: `https://www.google.com/search?q=${encodeURIComponent(`watch ${title} online`)}`, note: "Find where it officially streams" },
    ],
  };
}
