import type { MovieKind } from "./types";
import { providerTitlesTmdb } from "./tmdb";

/** Streaming platforms ("channels") the homepage's Popular section and the
 *  /channel/<slug> pages are built around. providerId is TMDB's
 *  watch-provider id (their availability data comes from JustWatch — which
 *  is why "JustWatch" itself isn't a channel here: it's an aggregator, not
 *  a place anything streams). Ids are stable, documented TMDB values:
 *  Netflix 8, Prime Video 119, Apple TV+ 350, Hotstar/JioHotstar 122,
 *  Disney+ 337, ZEE5 232, Sony LIV 237, Crunchyroll 283, Google Play 3,
 *  YouTube 192, MX Player 515, Aha 532. */
export interface Channel {
  slug: string;
  name: string;
  providerId: number;
  /** Brand accent color for the card + page header. */
  color: string;
  /** One-line pitch shown on the card and used in the page's meta description. */
  desc: string;
}

export const CHANNELS: Channel[] = [
  { slug: "netflix", name: "Netflix", providerId: 8, color: "#e50914", desc: "Trending movies & series streaming on Netflix" },
  { slug: "prime-video", name: "Prime Video", providerId: 119, color: "#00a8e1", desc: "What's hot on Amazon Prime Video right now" },
  { slug: "jiohotstar", name: "JioHotstar", providerId: 122, color: "#1f80e0", desc: "Blockbusters, live-event tie-ins & originals on JioHotstar" },
  { slug: "apple-tv", name: "Apple TV+", providerId: 350, color: "#a9aab0", desc: "Apple Originals — prestige series & films" },
  { slug: "zee5", name: "ZEE5", providerId: 232, color: "#8230c6", desc: "Desi originals, movies & serials on ZEE5" },
  { slug: "sony-liv", name: "Sony LIV", providerId: 237, color: "#f2b101", desc: "Sony LIV originals, movies & sports dramas" },
  { slug: "disney-plus", name: "Disney+", providerId: 337, color: "#5a6cf3", desc: "Disney, Pixar, Marvel & Star Wars titles" },
  { slug: "crunchyroll", name: "Crunchyroll", providerId: 283, color: "#f47521", desc: "The biggest anime library on the planet" },
  { slug: "google-play", name: "Play Store", providerId: 3, color: "#34a853", desc: "Rent or buy the latest releases on Google Play Movies" },
  { slug: "youtube", name: "YouTube", providerId: 192, color: "#ff0000", desc: "Movies to rent, buy or stream free on YouTube" },
  { slug: "mx-player", name: "MX Player", providerId: 515, color: "#3c9bf4", desc: "Free movies & web series on MX Player" },
  { slug: "aha", name: "Aha", providerId: 532, color: "#ff6a2b", desc: "Telugu & Tamil originals on Aha" },
];

export const channelBySlug = (slug: string): Channel | undefined => CHANNELS.find((c) => c.slug === slug);

/** Latest titles streaming on one channel — thin wrapper so pages don't
 *  need to know about provider ids at all. */
export const channelTitles = (channel: Channel, kind: MovieKind, limit = 18, page = 1) =>
  providerTitlesTmdb(channel.providerId, kind, limit, page);
