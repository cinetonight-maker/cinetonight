import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/site";

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
      // (movies, blog, FAQ, channels) but are kept off the person pages:
      // an effectively unbounded URL space they were re-crawling tens of
      // thousands of times a day. A matching edge rule enforces this for
      // crawlers that ignore robots.txt.
      ...["ClaudeBot", "anthropic-ai", "GPTBot", "OAI-SearchBot", "ChatGPT-User",
          "PerplexityBot", "CCBot", "Meta-ExternalAgent", "Amazonbot"].map(
        (bot) => ({ userAgent: bot, allow: "/", disallow: "/person/" })),
      {
      userAgent: "*",
      allow: "/",
      // /account, /my-list, /signin, /signup all require a real signed-in
      // user — an anonymous crawler hitting them either gets redirected or
      // sees an empty gate, never real content, so there's no reason to
      // spend crawl budget on them (same reasoning /admin and /api/ were
      // already excluded for).
      disallow: ["/admin", "/api/", "/account", "/my-list", "/signin", "/signup"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
