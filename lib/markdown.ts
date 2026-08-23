import { marked } from "marked";

/* ============================================================================
 * lib/markdown.ts — the ONE place CineTonight turns Markdown into HTML.
 *
 * Used by: blog articles, static pages, and the admin preview — so what an
 * author sees in Preview is produced by exactly the same code that renders
 * the published page.
 *
 * SECURITY MODEL (why there is no DOMPurify dependency here):
 * raw HTML is not passed through at all. Every `<` in the source is escaped
 * BEFORE Markdown parsing, so the only HTML that can exist in the output is
 * HTML that `marked` itself constructed from Markdown syntax. That removes
 * the entire `<script>` / `<img onerror>` / `<iframe>` class of injection by
 * construction rather than by blocklist. The two things Markdown can still
 * produce that need checking — link and image URLs — are validated against a
 * scheme allow-list, so `[x](javascript:alert(1))` cannot survive.
 *
 * Consequence to know: authors cannot embed arbitrary HTML in a post. That is
 * deliberate. Embeds we want (YouTube) are added as explicit, controlled
 * syntax below rather than by opening the door to raw HTML.
 * ========================================================================= */

/** Schemes a link or image may use. Anything else is dropped. */
const SAFE_SCHEME = /^(https?:\/\/|\/|#|mailto:)/i;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `@youtube(VIDEO_ID)` on its own line → a privacy-friendly, click-to-load
 *  thumbnail link. We deliberately do NOT emit an <iframe>: an auto-loading
 *  YouTube player would cost every reader ~700KB and wreck Core Web Vitals,
 *  which is the same rule the movie pages follow. */
function youtubeBlocks(md: string): string {
  return md.replace(/^@youtube\(([A-Za-z0-9_-]{6,20})\)\s*$/gm, (_m, id: string) =>
    `[![Watch on YouTube](https://i.ytimg.com/vi/${id}/hqdefault.jpg)](https://www.youtube.com/watch?v=${id})`,
  );
}

/** Render Markdown to safe HTML. */
export function renderMarkdown(source: string | string[] | null | undefined): string {
  if (!source) return "";
  // Legacy rows stored the body as an array of paragraphs; joining with blank
  // lines IS the migration, so old and new content render identically even
  // before the database migration has run.
  const raw = Array.isArray(source) ? source.join("\n\n") : source;

  const escaped = escapeHtml(raw);
  const html = marked.parse(youtubeBlocks(escaped), { async: false, gfm: true, breaks: false }) as string;

  // Post-pass: enforce the URL allow-list, and make outbound links safe.
  return html
    .replace(/<a\s+href="([^"]*)"/gi, (m, href: string) => {
      if (!SAFE_SCHEME.test(href)) return '<a data-blocked="1"';
      const external = /^https?:\/\//i.test(href);
      return external
        ? `<a href="${href}" target="_blank" rel="noopener nofollow ugc"`
        : `<a href="${href}"`;
    })
    .replace(/<img\s+src="([^"]*)"/gi, (m, src: string) =>
      SAFE_SCHEME.test(src) ? `<img loading="lazy" decoding="async" src="${src}"` : "<img");
}

/** Plain text of a body — for excerpts, word counts and reading time. */
export function markdownToText(source: string | string[] | null | undefined): string {
  if (!source) return "";
  const raw = Array.isArray(source) ? source.join("\n\n") : source;
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const wordCount = (source: string | string[] | null | undefined): number => {
  const t = markdownToText(source);
  return t ? t.split(/\s+/).length : 0;
};

/** Reading time at 220 wpm, floored at 1 minute — the label shown on cards. */
export const readingTime = (source: string | string[] | null | undefined): string =>
  `${Math.max(1, Math.round(wordCount(source) / 220))} min`;

/** Headings an author has used, for the editor's outline/SEO hints. */
export function outlineOf(source: string | string[] | null | undefined): { level: number; text: string }[] {
  if (!source) return [];
  const raw = Array.isArray(source) ? source.join("\n\n") : source;
  const out: { level: number; text: string }[] = [];
  for (const line of raw.split("\n")) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line.trim());
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}
