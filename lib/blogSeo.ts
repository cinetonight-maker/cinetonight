/* ============================================================================
 * lib/blogSeo.ts — the publish checklist.
 *
 * WHY THIS EXISTS: the goal is to publish SEO-ready articles for months
 * without touching code. That only works if the dashboard KNOWS what
 * "SEO-ready" means, rather than leaving it to whoever is typing that day to
 * remember eleven rules. Everything in the house guidelines that a machine can
 * check is checked here, and shown in the editor before Publish.
 *
 * PURE MODULE — no imports, no React, no network. Every rule is unit-tested
 * directly (tests/blogSeo.test.mjs) instead of only through a rendered screen.
 *
 * The checks WARN, they do not BLOCK. A checklist that refuses to publish is a
 * checklist people learn to route around; one that tells you exactly what is
 * missing gets used. The only genuinely blocking problems are the ones the API
 * already rejects (no title, duplicate slug).
 * ========================================================================= */

export type CheckStatus = "ok" | "warn" | "fail";

export interface Check {
  id: string;
  /** Short label, shown as the row. */
  label: string;
  status: CheckStatus;
  /** What to do about it. Empty when the check passes. */
  hint: string;
}

export interface BlogSeoInput {
  title: string;
  slug: string;
  body: string;
  excerpt?: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  secondaryKeywords?: string[];
  imageUrl?: string | null;
  imageAlt?: string | null;
  canonicalUrl?: string | null;
  ogImage?: string | null;
  cat?: string | null;
  noindex?: boolean;
}

/* ---------------------------------------------------------------------------
 * Heading structure
 * ------------------------------------------------------------------------ */

export interface Heading { level: number; text: string }

/** Every ATX heading in the body, in order. Fenced code blocks are skipped so
 *  a "# comment" inside a code sample is never mistaken for an H1. */
export function headingsOf(markdown: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const raw of (markdown || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim() });
  }
  return out;
}

/**
 * House rule, straight from the guidelines: exactly one H1, H2 for main
 * sections, H3 only for deeper subsections — so a level may never be skipped.
 */
export function headingIssues(markdown: string): string[] {
  const hs = headingsOf(markdown);
  const issues: string[] = [];
  const h1s = hs.filter((h) => h.level === 1);

  if (h1s.length === 0) issues.push("No H1. Start the article with a single `# ` heading.");
  if (h1s.length > 1) issues.push(`${h1s.length} H1 headings. Keep exactly one and demote the rest to H2.`);
  if (hs.length && hs[0].level !== 1) issues.push("The first heading is not the H1. The H1 should open the article.");
  if (!hs.some((h) => h.level === 2)) issues.push("No H2 sections. Break the article into H2 sections.");

  let previous = 0;
  for (const h of hs) {
    if (previous && h.level > previous + 1) {
      issues.push(`"${h.text}" jumps from H${previous} to H${h.level}. Do not skip a level.`);
    }
    previous = h.level;
  }
  return issues;
}

/* ---------------------------------------------------------------------------
 * Text helpers
 * ------------------------------------------------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** Does `haystack` contain `needle`, ignoring case, curly quotes and spacing? */
export const contains = (haystack: string | null | undefined, needle: string): boolean =>
  !!haystack && !!needle && norm(haystack).includes(norm(needle));

/** Compare a keyword against a URL slug in SLUG SPACE, not text space.
 *
 *  A slug never contains apostrophes or punctuation, so comparing
 *  "cant-decide-what-to-watch-tonight" against the phrase "can't decide what
 *  to watch tonight" as plain text always fails — and would have told an
 *  author to fix a URL that was already perfect. Both sides are reduced to the
 *  same alphanumeric-and-hyphens form before comparing. */
export const slugContains = (slug: string | null | undefined, keyword: string): boolean => {
  // Separators are removed entirely rather than normalised to hyphens.
  // "can't" slugifies to "cant" for a human writing the URL by hand and to
  // "can-t" for an automatic slugifier — both are the same URL in spirit, and
  // only dropping the separators makes both match the phrase.
  const bare = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!slug || !keyword) return false;
  return bare(slug).includes(bare(keyword));
};

/** The article's opening prose — the first non-heading, non-empty paragraph. */
export function firstParagraph(markdown: string): string {
  let inFence = false;
  for (const raw of (markdown || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !line) continue;
    if (/^#{1,6}\s/.test(line)) continue;
    if (/^([*+-]|\d+\.)\s/.test(line) || line.startsWith(">")) continue;
    return line;
  }
  return "";
}

/** Words in the body, excluding headings and fenced code. */
export function wordCountOf(markdown: string): number {
  const text = (markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+.*$/gm, " ")
    .replace(/[#*_`>[\]()]/g, " ");
  return (text.match(/\b[\p{L}\p{N}'-]+\b/gu) ?? []).length;
}

/** Internal links (`](/...)`) found in the body, deduped, in order. */
export function internalLinksOf(markdown: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Image syntax is stripped first so ![alt](/pic.jpg) is never read as a link.
  const text = (markdown || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
  for (const m of text.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    const href = m[1];
    if (!seen.has(href)) { seen.add(href); out.push(href); }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * The checklist
 * ------------------------------------------------------------------------ */

/** Slug rule: evergreen, no dates unless the topic is genuinely time-sensitive. */
const DATED_SLUG = /(^|-)(19|20)\d{2}(-|$)|(^|-)(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|tember|ober|ember)?(-|$)/i;

export function seoChecklist(post: BlogSeoInput): Check[] {
  const checks: Check[] = [];
  // A passing row never carries a hint. Telling someone how to fix something
  // they have already done right is noise, and noise is how a checklist stops
  // being read — so the advice is attached unconditionally at each call site
  // and dropped here once the check passes.
  const add = (id: string, label: string, status: CheckStatus, hint = "") =>
    checks.push({ id, label, status, hint: status === "ok" ? "" : hint });

  const kw = (post.focusKeyword ?? "").trim();
  const effectiveTitle = (post.metaTitle || post.title || "").trim();
  const effectiveDesc = (post.metaDescription || post.excerpt || "").trim();

  /* ---- structure ---- */
  const structural = headingIssues(post.body);
  add("headings", "Heading structure",
    structural.length ? "fail" : "ok",
    structural.join(" "));

  const words = wordCountOf(post.body);
  add("length", `Length — ${words} words`,
    words >= 600 ? "ok" : words >= 300 ? "warn" : "fail",
    words >= 600 ? "" : "Short articles rarely rank. Aim for 600+ words of real substance.");

  /* ---- the focus keyword, which is the spine of the rest ---- */
  if (!kw) {
    add("focus", "Focus keyword", "fail", "Set the one phrase this article should rank for. Every check below depends on it.");
  } else {
    add("focus", `Focus keyword — "${kw}"`, "ok");
    add("kw-title", "Focus keyword in the title",
      contains(effectiveTitle, kw) ? "ok" : "warn",
      "Google weighs the title heavily. Work the phrase in naturally, ideally near the start.");
    add("kw-desc", "Focus keyword in the meta description",
      contains(effectiveDesc, kw) ? "ok" : "warn",
      "It is bolded in the results page, which lifts click-through.");
    add("kw-slug", "Focus keyword in the URL",
      slugContains(post.slug, kw) ? "ok" : "warn",
      "Only worth changing before the first publish — renaming a live URL breaks every link to it.");
    add("kw-intro", "Focus keyword in the opening paragraph",
      contains(firstParagraph(post.body), kw) ? "ok" : "warn",
      "Confirm the topic in the first sentence or two, for readers as much as for Google.");
    const inHeading = headingsOf(post.body).some((h) => h.level >= 2 && contains(h.text, kw));
    add("kw-heading", "Focus keyword in at least one H2",
      inHeading ? "ok" : "warn",
      "One section heading should carry the phrase. One is enough — more reads as stuffing.");
  }

  /* ---- the snippet ---- */
  const tLen = effectiveTitle.length;
  add("title-length", `SEO title — ${tLen} characters`,
    tLen === 0 ? "fail" : tLen <= 60 ? "ok" : "warn",
    tLen === 0 ? "Add a title." : tLen > 60 ? "Over 60 characters is usually truncated in results." : "");

  const dLen = effectiveDesc.length;
  add("desc-length", `Meta description — ${dLen} characters`,
    dLen === 0 ? "fail" : dLen >= 120 && dLen <= 160 ? "ok" : "warn",
    dLen === 0 ? "Add a meta description, or an excerpt to fall back on."
      : dLen < 120 ? "Under 120 characters wastes space Google would have given you."
      : "Over 160 characters is usually truncated.");

  /* ---- artwork ---- */
  add("image", "Featured image",
    post.imageUrl ? "ok" : "warn",
    "Used on the blog index, the homepage guides strip and social shares.");
  add("image-alt", "Featured image alt text",
    post.imageUrl ? (post.imageAlt?.trim() ? "ok" : "warn") : "ok",
    post.imageUrl && !post.imageAlt?.trim() ? "Describe the image for screen readers and image search." : "");

  /* ---- taxonomy and links ---- */
  add("category", "Category",
    post.cat?.trim() ? "ok" : "warn",
    "Pick the closest existing category, or add one if nothing fits.");

  const links = internalLinksOf(post.body);
  add("internal-links", `Internal links — ${links.length}`,
    links.length >= 2 ? "ok" : links.length === 1 ? "warn" : "fail",
    links.length >= 2 ? "" : "Link to at least two relevant CineTonight pages, e.g. /discover, /movies, /free-movies.");

  /* ---- URL policy ---- */
  add("slug-evergreen", "Evergreen URL",
    DATED_SLUG.test(post.slug) ? "warn" : "ok",
    DATED_SLUG.test(post.slug) ? "The URL contains a date or month. Only keep it if the topic is genuinely time-sensitive." : "");

  /* ---- the dangerous switches ---- */
  if (post.noindex) {
    add("noindex", "Hidden from Google", "warn",
      "noindex is ON. This article will not appear in search results at all.");
  }
  if (post.canonicalUrl?.trim()) {
    add("canonical", "Canonical points elsewhere", "warn",
      `Search engines are being told the real version lives at ${post.canonicalUrl.trim()}. This article will usually not rank on its own.`);
  }

  return checks;
}

export const countByStatus = (checks: Check[]) => ({
  ok: checks.filter((c) => c.status === "ok").length,
  warn: checks.filter((c) => c.status === "warn").length,
  fail: checks.filter((c) => c.status === "fail").length,
});

/** One-line summary for the editor header. */
export function checklistSummary(checks: Check[]): string {
  const { ok, warn, fail } = countByStatus(checks);
  if (fail) return `${fail} to fix, ${warn} to review`;
  if (warn) return `Ready — ${warn} worth reviewing`;
  return `All ${ok} checks pass`;
}
