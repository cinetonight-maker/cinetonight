import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

// Paths no crawler has any business in: auth-gated pages, APIs, and the
// legacy /_next/image optimizer endpoint (nothing links to it since images
// went unoptimized, but crawlers replay remembered URLs against it forever
// - 85k hits in one observed day - and every hit wakes the server).
const COMMON_DISALLOW = [
  "/admin", "/api/", "/account", "/my-list", "/signin", "/signup", "/_next/image",
];

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();
  return {
    rules: [
      // Aggressive scrapers and SEO-tool crawlers: they re-crawl thousands
      // of dynamic pages, burn serverless compute, and send zero visitors.
      // Google/Bing/DuckDuckGo and citing AI engines remain fully allowed.
      ...["Bytespider", "PetalBot", "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot",
          "DataForSeoBot", "BLEXBot", "ZoominfoBot", "MegaIndex", "serpstatbot"].map(
        (bot) => ({ userAgent: bot, disallow: "/" })),
      // AI crawlers stay welcome on the content that earns citations
      // (movies, blog, FAQ, channels) but are kept off the unbounded URL
      // spaces they binge on: person pages and the image endpoint.
      // NOTE: a bot that matches a specific group IGNORES the "*" group
      // entirely, so this list must repeat every common exclusion too.
      // A matching edge rule enforces this for crawlers that ignore robots.
      ...["ClaudeBot", "anthropic-ai", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
          "PerplexityBot", "CCBot", "Meta-ExternalAgent", "Amazonbot"].map(
        (bot) => ({ userAgent: bot, allow: "/", disallow: [...COMMON_DISALLOW, "/person/"] })),
      {
        userAgent: "*",
        allow: "/",
        // /account, /my-list, /signin, /signup all require a real signed-in
        // user - an anonymous crawler hitting them either gets redirected or
        // sees an empty gate, never real content, so there's no reason to
        // spend crawl budget on them (same reasoning /admin and /api/ were
        // already excluded for).
        disallow: COMMON_DISALLOW,
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
