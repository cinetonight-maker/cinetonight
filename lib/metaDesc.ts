/* ============================================================================
 * lib/metaDesc.ts — one honest way to shorten a meta description.
 *
 * Deliberately ZERO imports. It lives apart from lib/site.ts so it can be
 * unit tested directly (site.ts pulls in ./genres, which cannot be resolved
 * by the type-stripping test runner) and so client components can use it
 * without dragging anything else into the browser bundle.
 * ========================================================================= */

/** Longest meta description we ship. Google truncates around here, and the
 *  admin SERP preview uses the same number so what an author sees is what
 *  ships. */
export const META_DESC_MAX = 158;

/**
 * Trim a meta description to length WITHOUT cutting a word in half.
 *
 * THE BUG THIS REPLACES: every description was built by concatenating a
 * sentence with a synopsis and then calling `.slice(0, 158)`. That cuts
 * wherever the 158th character happens to land, so live pages ended with
 * "...where to check streaming availabi" and "...trailer breakdown and latest
 * update". Three blog posts were caught doing it in docs/BLOG-AUDIT.md, but
 * the movie, channel and free-movies templates had the same call, which put
 * the same broken ending on every one of those pages.
 *
 * Behaviour: text already inside the limit is returned untouched, with no
 * ellipsis - a description that ends in a full stop should keep it. Anything
 * longer is cut at the last word boundary that leaves room for the ellipsis,
 * with trailing spaces and dangling punctuation removed so it never reads
 * "watch it ,…". Falls back to a hard cut only for a single word longer than
 * the whole limit, which cannot be broken cleanly anyway.
 */
export function metaDescription(text: string, max: number = META_DESC_MAX): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const room = max - 1; // one character for the ellipsis
  const cut = clean.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  const body = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:.!?\-]+$/, "") + "\u2026";
}
