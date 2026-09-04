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
  /** Titles of every OTHER live post, so a duplicate is caught before it is
   *  published rather than after it has split a keyword in two. Optional:
   *  omit it and the duplicate check simply does not run. */
  siblingTitles?: string[];
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
 * House rule: the BODY CONTAINS NO H1.
 *
 * CORRECTED 23 Aug 2026, after this check caused the bug it was meant to
 * prevent. app/blog/[slug]/page.tsx already renders the post title as the
 * page's `<h1 className="article__t">`, so an H1 in the markdown is a SECOND
 * one — and because both come from the same title, the heading appeared
 * visibly twice, one under the other, on every article written to the old
 * rule. Verified on the live site before changing this.
 *
 * The body therefore starts at H2, and H3 only for deeper subsections, with no
 * level skipped.
 */
export function headingIssues(markdown: string): string[] {
  const hs = headingsOf(markdown);
  const issues: string[] = [];
  const h1s = hs.filter((h) => h.level === 1);

  if (h1s.length) {
    issues.push(
      `${h1s.length === 1 ? "An H1 in the body" : `${h1s.length} H1 headings in the body`}. ` +
      "The page already shows the title as its H1, so this renders it twice. " +
      "Delete the `# ` line and start the article at `## `.",
    );
  }
  // Only worth saying when there is no H1 to explain it. An article that opens
  // with an H1 already has one clear instruction; a second line about levels
  // would just be the same problem described twice.
  if (!h1s.length && hs.length && hs[0].level !== 2) {
    issues.push("The article should open at H2. Its first heading is not one.");
  }
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

/* ---------------------------------------------------------------------------
 * Added after the 23 Aug 2026 blog audit (docs/BLOG-AUDIT.md), which found six
 * live posts with NO section headings, three meta descriptions cut off
 * mid-word, and two posts sharing one title. All three passed the checklist as
 * it stood. Each rule below exists because something real got through.
 * ------------------------------------------------------------------------ */

/** Headings the template appends or that every post carries regardless of what
 *  the article says. They are not evidence that the article has structure. */
const BOILERPLATE_HEADING = /^(faqs?|read next|comments?)$|frequently asked questions?/i;

/** The H2s that represent actual sections of the article.
 *
 *  WHY THIS IS SEPARATE FROM headingIssues(): that check asks "is the heading
 *  hierarchy valid", and a lone "Frequently asked questions" satisfies it. Six
 *  posts scored green on structure while having none — an article called "The
 *  10 Essentials" with no heading for any of the ten. Valid hierarchy and
 *  actual structure are different questions, so they get different checks. */
export function bodyHeadings(markdown: string): Heading[] {
  return headingsOf(markdown)
    .filter((h) => h.level === 2 && !BOILERPLATE_HEADING.test(h.text.trim()));
}

/** Does this meta description look like it was sliced rather than written?
 *
 *  The three that shipped all failed identically: 158 characters, ending
 *  mid-word ("...streaming availabi"). A description near the cap that does
 *  not end on a sentence is nearly always a cut, not a choice. */
export function looksTruncated(desc: string | null | undefined): boolean {
  const s = (desc ?? "").trim();
  return s.length >= 150 && !/[.!?…”"')\]]$/.test(s);
}

/** How much two titles overlap, 0 to 1, comparing meaningful words only.
 *  Short words carry no topic signal and would inflate every comparison. */
export function titleOverlap(a: string, b: string): number {
  const words = (s: string) =>
    new Set(
      s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2),
    );
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Sibling titles close enough to this one to compete for the same query.
 *  0.6 is deliberately loose: two posts do not need identical titles to split
 *  a keyword, and a false warning costs a glance while a real duplicate costs
 *  a ranking. */
export function competingTitles(title: string, siblings: string[] | undefined): string[] {
  if (!title?.trim() || !siblings?.length) return [];
  return siblings.filter((s) => s?.trim() && titleOverlap(title, s) >= 0.6);
}

/** A question and its answer, pulled out of the article's FAQ section.
 *
 *  WHY: Google and the AI answer engines lift FAQ content almost verbatim, but
 *  only when it is marked up as FAQPage. Writing the questions as headings is
 *  not enough on its own — the structured data has to say what they are. This
 *  turns prose an author already wrote into that markup, so nobody has to
 *  maintain the schema by hand or remember it exists. */
export interface FaqPair { question: string; answer: string }

/**
 * Every question under the article's FAQ heading, with the prose beneath it.
 *
 * Scoped to the FAQ section deliberately: an H3 elsewhere in the article is a
 * subsection, not a question, and marking one up as an FAQ entry would be a
 * false claim about the page. Stops at the next H2 for the same reason.
 */
export function faqPairs(markdown: string): FaqPair[] {
  const lines = (markdown || "").split(/\r?\n/);
  const out: FaqPair[] = [];
  let inFaq = false;
  let inFence = false;
  let question = "";
  let answer: string[] = [];

  const flush = () => {
    const text = answer.join(" ").trim();
    if (question && text) out.push({ question, answer: text });
    question = "";
    answer = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) { if (inFaq && question) answer.push(line); continue; }

    const h2 = /^##\s+(.*\S)\s*$/.exec(line);
    if (h2) {
      flush();
      // Entering the FAQ block, or leaving it for an unrelated section.
      inFaq = BOILERPLATE_HEADING.test(h2[1].trim()) && !/^(read next|comments?)$/i.test(h2[1].trim());
      continue;
    }
    if (!inFaq) continue;

    const h3 = /^###\s+(.*\S)\s*$/.exec(line);
    if (h3) { flush(); question = h3[1].trim(); continue; }

    // Strip the markdown that would otherwise leak into a JSON-LD string.
    if (question && line) {
      answer.push(
        line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
            .replace(/[*_`]/g, "")
            .trim(),
      );
    }
  }
  flush();
  return out;
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

  // Structure the article actually has, as opposed to a valid hierarchy.
  const sections = bodyHeadings(post.body);
  add("sections", `Article sections - ${sections.length}`,
    sections.length >= 2 ? "ok" : sections.length === 1 ? "warn" : "fail",
    sections.length >= 2 ? ""
      : "Break the article into H2 sections. An FAQ heading on its own is not structure - readers cannot scan the piece and Google cannot see what it covers.");

  const words = wordCountOf(post.body);
  add("length", `Length - ${words} words`,
    words >= 600 ? "ok" : words >= 300 ? "warn" : "fail",
    words >= 600 ? "" : "Short articles rarely rank. Aim for 600+ words of real substance.");

  /* ---- the focus keyword, which is the spine of the rest ---- */
  if (!kw) {
    add("focus", "Focus keyword", "fail", "Set the one phrase this article should rank for. Every check below depends on it.");
  } else {
    add("focus", `Focus keyword - "${kw}"`, "ok");
    add("kw-title", "Focus keyword in the title",
      contains(effectiveTitle, kw) ? "ok" : "warn",
      "Google weighs the title heavily. Work the phrase in naturally, ideally near the start.");
    add("kw-desc", "Focus keyword in the meta description",
      contains(effectiveDesc, kw) ? "ok" : "warn",
      "It is bolded in the results page, which lifts click-through.");
    add("kw-slug", "Focus keyword in the URL",
      slugContains(post.slug, kw) ? "ok" : "warn",
      "Only worth changing before the first publish - renaming a live URL breaks every link to it.");
    add("kw-intro", "Focus keyword in the opening paragraph",
      contains(firstParagraph(post.body), kw) ? "ok" : "warn",
      "Confirm the topic in the first sentence or two, for readers as much as for Google.");
    const inHeading = headingsOf(post.body).some((h) => h.level >= 2 && contains(h.text, kw));
    add("kw-heading", "Focus keyword in at least one H2",
      inHeading ? "ok" : "warn",
      "One section heading should carry the phrase. One is enough - more reads as stuffing.");
  }

  /* ---- the snippet ---- */
  const tLen = effectiveTitle.length;
  add("title-length", `SEO title - ${tLen} characters`,
    tLen === 0 ? "fail" : tLen <= 60 ? "ok" : "warn",
    tLen === 0 ? "Add a title." : tLen > 60 ? "Over 60 characters is usually truncated in results." : "");

  const dLen = effectiveDesc.length;
  add("desc-length", `Meta description - ${dLen} characters`,
    dLen === 0 ? "fail" : dLen >= 120 && dLen <= 160 ? "ok" : "warn",
    dLen === 0 ? "Add a meta description, or an excerpt to fall back on."
      : dLen < 120 ? "Under 120 characters wastes space Google would have given you."
      : "Over 160 characters is usually truncated.");

  add("desc-complete", "Meta description ends cleanly",
    looksTruncated(effectiveDesc) ? "warn" : "ok",
    "This looks cut off rather than written to length. Finish the sentence - a description that stops mid-word makes the whole result look broken.");

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
  add("internal-links", `Internal links - ${links.length}`,
    links.length >= 2 ? "ok" : links.length === 1 ? "warn" : "fail",
    links.length >= 2 ? "" : "Link to at least two relevant CineTonight pages, e.g. /discover, /movies, /free-movies.");

  /* ---- does this post already exist? ---- */
  const competing = competingTitles(effectiveTitle, post.siblingTitles);
  if (post.siblingTitles?.length) {
    add("unique-title", "No competing post",
      competing.length ? "warn" : "ok",
      competing.length
        ? `Very close to ${competing.length === 1 ? "an existing post" : `${competing.length} existing posts`}: ${competing.map((t) => `"${t}"`).join(", ")}. Two posts on one topic split the ranking between them - Google picks one and buries the other. Merge them, or make each answer a clearly different question.`
        : "");
  }

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
  if (warn) return `Ready - ${warn} worth reviewing`;
  return `All ${ok} checks pass`;
}
