import type { MovieKind } from "./types";
import { providerTitlesTmdb } from "./tmdb";

/** Streaming platforms ("channels") the homepage's Popular section and the
 *  /channel/<slug> pages are built around. providerId is TMDB's
 *  watch-provider id (their availability data comes from JustWatch — which
 *  is why "JustWatch" itself isn't a channel here: it's an aggregator, not
 *  a place anything streams).
 *
 *  `logoFile` names a file in public/channel-logos/ — downloaded ONCE from
 *  Wikimedia Commons' official brand assets by scripts/fetch-channel-logos.mjs
 *  and then served from our own origin (hotlinking the originals proved
 *  flaky — redirects + external availability = broken images). Channels
 *  without a logo file render the gradient card. `logoInvert` flags
 *  dark/black logo art that needs inverting on our dark cards.
 *
 *  `region` overrides the default IN watch-region for providers JustWatch
 *  tracks elsewhere (e.g. Viki's catalogue lives under US). Disney+ is
 *  deliberately ABSENT: it shut down in India in 2025 (merged into
 *  JioHotstar), so its IN availability data is empty — JioHotstar is its
 *  successor here. Eros Now was removed for the same reason: TMDB's IN
 *  data no longer tracks it as a standalone service (verified via
 *  scripts/check-providers.mjs — 0 titles). */
export interface Channel {
  slug: string;
  name: string;
  providerId: number;
  /** Brand accent color for the card + page header. */
  color: string;
  /** One-line pitch shown on the card and used in the page's meta description. */
  desc: string;
  /** File name inside public/channel-logos/ (see scripts/fetch-channel-logos.mjs). */
  logoFile?: string;
  /** True when the logo art is black/dark and needs inverting on dark cards. */
  logoInvert?: boolean;
  /** TMDB watch_region for this provider (defaults to IN). */
  region?: string;
}

export const CHANNELS: Channel[] = [
  { slug: "netflix", name: "Netflix", providerId: 8, color: "#e50914", desc: "Trending movies & series streaming on Netflix", logoFile: "netflix.svg" },
  { slug: "prime-video", name: "Prime Video", providerId: 119, color: "#00a8e1", desc: "What's hot on Amazon Prime Video right now", logoFile: "prime-video.svg" },
  { slug: "jiohotstar", name: "JioHotstar", providerId: 2336, color: "#1f80e0", desc: "Blockbusters, live-event tie-ins & originals on JioHotstar", logoFile: "jiohotstar.svg" },
  { slug: "apple-tv", name: "Apple TV+", providerId: 350, color: "#a9aab0", desc: "Apple Originals — prestige series & films", logoFile: "apple-tv.svg", logoInvert: true },
  { slug: "zee5", name: "ZEE5", providerId: 232, color: "#8230c6", desc: "Desi originals, movies & serials on ZEE5", logoFile: "zee5.png" },
  { slug: "sony-liv", name: "Sony LIV", providerId: 237, color: "#f2b101", desc: "Sony LIV originals, movies & sports dramas", logoFile: "sony-liv.svg" },
  { slug: "crunchyroll", name: "Crunchyroll", providerId: 283, color: "#f47521", desc: "The biggest anime library on the planet", logoFile: "crunchyroll.svg" },
  { slug: "viki", name: "Rakuten Viki", providerId: 344, color: "#1fbdd7", desc: "K-Dramas, C-Dramas & Asian hits with subtitles", logoFile: "viki.svg", region: "US" },
  { slug: "sun-nxt", name: "Sun NXT", providerId: 309, color: "#f7a600", desc: "Tamil, Telugu, Malayalam & Kannada movies on Sun NXT", logoFile: "sun-nxt.svg" },
  { slug: "hoichoi", name: "Hoichoi", providerId: 315, color: "#f52a5b", desc: "Bengali originals, films & thrillers on Hoichoi", logoFile: "hoichoi.svg" },
  { slug: "shemaroo-me", name: "ShemarooMe", providerId: 474, color: "#ec1c24", desc: "Evergreen Bollywood classics & family entertainment on ShemarooMe", logoFile: "shemaroo-me.svg" },
  { slug: "lionsgate-play", name: "Lionsgate Play", providerId: 561, color: "#f97316", desc: "Hollywood blockbusters & premium series on Lionsgate Play", logoFile: "lionsgate-play.svg" },
  { slug: "youtube", name: "YouTube", providerId: 192, color: "#ff0000", desc: "Movies to rent, buy or stream free on YouTube", logoFile: "youtube.svg" },
  { slug: "mx-player", name: "MX Player", providerId: 515, color: "#3c9bf4", desc: "Free movies & web series on MX Player", logoFile: "mx-player.svg" },
  { slug: "aha", name: "Aha", providerId: 532, color: "#ff6a2b", desc: "Telugu & Tamil originals on Aha", logoFile: "aha.svg" },
];

export const channelBySlug = (slug: string): Channel | undefined => CHANNELS.find((c) => c.slug === slug);

/** Latest titles streaming on one channel — thin wrapper so pages don't
 *  need to know about provider ids or regions at all. */
export const channelTitles = (channel: Channel, kind: MovieKind, limit = 18, page = 1, region?: string) =>
  providerTitlesTmdb(channel.providerId, kind, limit, page, region ?? channel.region ?? "IN");

/** Region-aware fetch with fallback: try the visitor's country first; if
 *  that market has no data for this provider, fall back to the channel's
 *  home region so cards/pages are never empty. Returns the titles plus
 *  which region actually supplied them. */
export async function channelTitlesForRegion(channel: Channel, kind: MovieKind, limit: number, visitorRegion: string): Promise<{ titles: Awaited<ReturnType<typeof providerTitlesTmdb>>; usedRegion: string }> {
  const primary = await channelTitles(channel, kind, limit, 1, visitorRegion);
  if (primary.length) return { titles: primary, usedRegion: visitorRegion };
  const home = channel.region ?? "IN";
  if (home !== visitorRegion) {
    const fallback = await channelTitles(channel, kind, limit, 1, home);
    if (fallback.length) return { titles: fallback, usedRegion: home };
  }
  return { titles: [], usedRegion: visitorRegion };
}
