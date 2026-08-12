import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /account, /my-list, /signin, /signup all require a real signed-in
      // user — an anonymous crawler hitting them either gets redirected or
      // sees an empty gate, never real content, so there's no reason to
      // spend crawl budget on them (same reasoning /admin and /api/ were
      // already excluded for).
      disallow: ["/admin", "/api/", "/account", "/my-list", "/signin", "/signup"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
