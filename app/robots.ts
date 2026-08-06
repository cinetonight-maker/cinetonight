import type { MetadataRoute } from "next";

/** Same fallback chain as app/sitemap.ts — set NEXT_PUBLIC_SITE_URL once
 *  there's a real domain; falls back to the Vercel deployment URL, then
 *  localhost, so this never crashes if it's unset. */
function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
