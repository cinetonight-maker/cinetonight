/** Filenames that exist in public/channel-logos/.
 *
 *  This list is code, not a runtime disk check, because the site runs on
 *  hosts with no filesystem at request time (Cloudflare Workers): an
 *  existsSync() there answers false for every file, which silently degraded
 *  every rich channel card to the plain gradient fallback.
 *
 *  After adding or removing files in public/channel-logos/, regenerate with:
 *    node scripts/gen-logo-manifest.mjs
 */
export const CHANNEL_LOGO_FILES = new Set<string>([
  "aha.svg",
  "apple-tv.svg",
  "crunchyroll.svg",
  "hoichoi.svg",
  "jiohotstar.png",
  "jiohotstar.svg",
  "lionsgate-play.svg",
  "mx-player.svg",
  "netflix.svg",
  "prime-video.svg",
  "shemaroo-me.svg",
  "sony-liv.svg",
  "sun-nxt.svg",
  "viki.svg",
  "youtube.svg",
  "zee5.png",
]);

export function channelLogoUrl(logoFile: string | undefined): string | null {
  return logoFile && CHANNEL_LOGO_FILES.has(logoFile)
    ? `/channel-logos/${logoFile}`
    : null;
}
