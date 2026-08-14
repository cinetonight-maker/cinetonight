import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/lib/data";

/** Web App Manifest — makes "Add to Home Screen" actually work with a real
 *  name/icon/theme instead of a bare bookmark, which matters a lot for a
 *  site whose growth plan runs on mobile social traffic (Instagram/TikTok/
 *  WhatsApp links opened on phones). Sourced from the same site-settings
 *  row the dashboard already writes, so it stays in sync if the title ever
 *  changes there. Next.js serves this at /manifest.webmanifest and wires up
 *  the <link rel="manifest"> tag automatically. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSiteSettings();
  // Brand-name extraction for the "%s — Brand" title template. Handles a
  // separator of any punctuation (dash, pipe, bullet, colon); if the title
  // has NO separator at all, a long derived name falls back to its first
  // word so page titles never carry the whole tagline as a suffix.
  const derived = s.siteTitle.split(/\s+[^A-Za-z0-9\s]+\s+/)[0].split(":")[0].trim();
  const shortName = (derived.length > 24 ? derived.split(/\s+/)[0] : derived) || s.siteTitle;
  return {
    name: s.siteTitle,
    short_name: shortName,
    description: s.siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a12",
    theme_color: "#0a0a12",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
    ],
  };
}
