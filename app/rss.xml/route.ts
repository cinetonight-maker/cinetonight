import { getBlogs, getSiteSettings } from "@/lib/data";
import { baseUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** RSS feed of published blog posts, newest first.
 *
 *  This exists to plug into the free "auto-post" loophole from the growth
 *  plan: point a free RSS-to-social tool (e.g. Dlvr.it, IFTTT, or a Zapier
 *  free-tier trigger) at https://<yourdomain>/rss.xml, and it will notice
 *  every new blog post the moment it's published in the dashboard and can
 *  auto-push a link to Telegram / X / a Discord webhook — no manual
 *  posting, no code changes needed on your end to add a new distribution
 *  channel later. Google/Bing also read RSS feeds as an extra discovery
 *  signal alongside the sitemap.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = baseUrl();
  const [blogs, settings] = await Promise.all([getBlogs(), getSiteSettings()]);

  const items = blogs
    .slice(0, 30)
    .map((b) => {
      const url = `${base}/blog/${b.slug}`;
      const pubDate = new Date(b.date);
      const pubDateStr = Number.isNaN(pubDate.getTime()) ? undefined : pubDate.toUTCString();
      return `  <item>
    <title>${escapeXml(b.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <description>${escapeXml(b.excerpt)}</description>
    <category>${escapeXml(b.cat)}</category>
    ${pubDateStr ? `<pubDate>${pubDateStr}</pubDate>` : ""}
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${escapeXml(settings.siteTitle)} — Blog</title>
  <link>${base}/blog</link>
  <description>${escapeXml(settings.siteDescription)}</description>
  <language>en</language>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
