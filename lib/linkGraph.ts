/* ============================================================================
 * lib/linkGraph.ts — internal linking: extraction, checking, suggestions.
 *
 * Stage 3 of the CMS update. Pure functions only (no database, no fetch), so
 * every rule below is unit-tested and the same code can run in the admin API,
 * in a script, or in a test.
 *
 * WHY THIS EXISTS
 * Internal links are the cheapest SEO work there is: they tell Google how the
 * site fits together and they keep readers moving between pages. But they only
 * help if they WORK. A link to a post that was renamed or trashed is worse
 * than no link — it sends readers and crawlers into a 404. Nothing in the old
 * dashboard could see that, because nothing ever looked inside article text.
 * ========================================================================= */

export interface LinkRef {
  /** Normalised path, e.g. "/blog/some-post". */
  href: string;
  /** The clickable words — the anchor text Google reads. */
  text: string;
  /** The original href exactly as written, for showing in the report. */
  raw: string;
}

export interface LinkTarget {
  path: string;
  label: string;
  /** What kind of thing this is, for grouping in the picker. */
  kind: "post" | "page" | "movie" | "series" | "free" | "section";
}

export type LinkStatus = "ok" | "broken" | "unverified" | "external";

/** Paths whose children cannot be listed: TMDB people and channels are an
 *  unbounded, live id space, and `/movie/tmdb-…` pages are fetched on demand.
 *  A link into one of these is reported as "unverified", never as broken —
 *  calling a working link broken is worse than saying nothing about it. */
const UNVERIFIABLE_PREFIXES = ["/person/", "/channel/", "/movie/tmdb-"];

/** Fixed routes that always exist. Keep in step with the app/ directory —
 *  a route added here that does not exist would hide a real broken link. */
export const STATIC_ROUTES = [
  "/", "/blog", "/discover", "/faq", "/follow", "/free-movies", "/genres",
  "/latest", "/links", "/movies", "/my-list", "/pricing", "/search",
  "/signin", "/signup", "/trending", "/tv-shows", "/web-series", "/account",
];

/* -------------------------------------------------------------------------- */
/* extraction                                                                 */
/* -------------------------------------------------------------------------- */

/** Strip the site's own origin, the query string and the #fragment, and drop a
 *  trailing slash — so "https://cinetonight.com/blog/x/?utm=1#top", "/blog/x/"
 *  and "/blog/x" are all recognised as the same page. */
export function normalizeHref(href: string, origin = "cinetonight.com"): string {
  let h = href.trim();
  h = h.replace(new RegExp(`^https?://(www\\.)?${origin.replace(/\./g, "\\.")}`, "i"), "");
  if (!h.startsWith("/")) return h;
  h = h.split("#")[0].split("?")[0];
  if (h.length > 1) h = h.replace(/\/+$/, "");
  return h || "/";
}

export function isInternal(href: string, origin = "cinetonight.com"): boolean {
  const h = href.trim();
  if (h.startsWith("#") || h.startsWith("mailto:")) return false;
  if (h.startsWith("/")) return true;
  return new RegExp(`^https?://(www\\.)?${origin.replace(/\./g, "\\.")}`, "i").test(h);
}

/** Every Markdown link in a body, in order.
 *
 *  Images are removed FIRST rather than excluded by a look-behind, because of
 *  the linked-image case: `[![thumb](image.jpg)](page)` is one link to `page`,
 *  not a link to `image.jpg`. Stripping the image leaves `[](page)`, which is
 *  exactly right — and that shape is what every @youtube() block becomes. */
export function extractLinks(source: string | string[] | null | undefined, origin = "cinetonight.com"): LinkRef[] {
  if (!source) return [];
  const raw = Array.isArray(source) ? source.join("\n\n") : source;
  const withoutImages = raw.replace(/!\[[^\]]*\]\([^)\s]*(?:\s+"[^"]*")?\)/g, "");

  const out: LinkRef[] = [];
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutImages)) !== null) {
    const href = m[2];
    out.push({ raw: href, href: isInternal(href, origin) ? normalizeHref(href, origin) : href, text: m[1].trim() });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* checking                                                                   */
/* -------------------------------------------------------------------------- */

export function statusOf(link: LinkRef, known: Set<string>, origin = "cinetonight.com"): LinkStatus {
  if (!isInternal(link.raw, origin)) return "external";
  if (known.has(link.href)) return "ok";
  if (UNVERIFIABLE_PREFIXES.some((p) => link.href.startsWith(p))) return "unverified";
  return "broken";
}

export interface DocumentRef {
  id: string;
  kind: "post" | "page";
  title: string;
  /** Its own path, so we can build the inbound-link map. */
  path: string;
  body: string | string[] | null | undefined;
  /** Drafts and trashed items are checked but never reported as orphans. */
  live: boolean;
}

export interface LinkIssue {
  from: { id: string; kind: "post" | "page"; title: string; path: string };
  href: string;
  text: string;
  status: Exclude<LinkStatus, "ok" | "external">;
}

export interface LinkReport {
  /** Internal links that point at nothing. Fix these first. */
  broken: LinkIssue[];
  /** Links we cannot check (people, channels, search). Informational. */
  unverified: LinkIssue[];
  /** Live pages that no other page links to — Google finds these last. */
  orphans: { id: string; kind: "post" | "page"; title: string; path: string }[];
  /** Live pages with fewer than MIN_OUTBOUND internal links. */
  thin: { id: string; kind: "post" | "page"; title: string; path: string; outbound: number }[];
  /** Inbound internal link count per path. */
  inbound: Record<string, number>;
  totals: { documents: number; internalLinks: number; externalLinks: number };
}

/** Two internal links per article is the working minimum: one deeper into the
 *  site and one back to a hub. Below that a post is a dead end. */
export const MIN_OUTBOUND = 2;

export function buildLinkReport(docs: DocumentRef[], targets: LinkTarget[], origin = "cinetonight.com"): LinkReport {
  const known = new Set<string>([...targets.map((t) => t.path), ...STATIC_ROUTES]);
  const broken: LinkIssue[] = [];
  const unverified: LinkIssue[] = [];
  const inbound: Record<string, number> = {};
  const thin: LinkReport["thin"] = [];
  let internalLinks = 0;
  let externalLinks = 0;

  for (const d of docs) {
    const from = { id: d.id, kind: d.kind, title: d.title, path: d.path };
    const links = extractLinks(d.body, origin);
    let outbound = 0;

    for (const l of links) {
      const status = statusOf(l, known, origin);
      if (status === "external") { externalLinks++; continue; }
      internalLinks++;
      // A link from a page to itself is not a real internal link.
      if (l.href !== d.path) {
        outbound++;
        inbound[l.href] = (inbound[l.href] ?? 0) + 1;
      }
      if (status === "broken") broken.push({ from, href: l.href, text: l.text, status });
      else if (status === "unverified") unverified.push({ from, href: l.href, text: l.text, status });
    }

    if (d.live && outbound < MIN_OUTBOUND) thin.push({ ...from, outbound });
  }

  const orphans = docs
    .filter((d) => d.live && !(inbound[d.path] > 0))
    .map((d) => ({ id: d.id, kind: d.kind, title: d.title, path: d.path }));

  return {
    broken, unverified, orphans, thin, inbound,
    totals: { documents: docs.length, internalLinks, externalLinks },
  };
}

/* -------------------------------------------------------------------------- */
/* suggestions                                                                */
/* -------------------------------------------------------------------------- */

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are", "was",
  "what", "when", "why", "how", "who", "all", "new", "best", "top", "watch", "movie",
  "movies", "series", "show", "shows", "film", "films", "online", "free", "guide",
  "india", "tonight", "streaming", "stream", "where", "which", "into", "about",
]);

const tokens = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

export interface RelatedInput {
  slug: string; title: string; cat?: string; tags?: string[] | null; excerpt?: string;
}

/** Posts to show under an article.
 *
 *  Scoring, in priority order: shared tags (3 points each) beat a shared
 *  category (2) which beats shared title words (1). Ties break toward the
 *  order the list arrived in, which is newest-first — so when nothing is
 *  clearly related the reader still gets the freshest posts rather than a
 *  random pick. */
export function relatedPosts<T extends RelatedInput>(all: T[], current: RelatedInput, limit = 3): T[] {
  const myTags = new Set((current.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean));
  const myWords = new Set(tokens(current.title));

  const scored = all
    .filter((p) => p.slug !== current.slug)
    .map((p, i) => {
      let score = 0;
      for (const t of p.tags ?? []) if (myTags.has(t.toLowerCase().trim())) score += 3;
      if (p.cat && current.cat && p.cat === current.cat) score += 2;
      for (const w of tokens(p.title)) if (myWords.has(w)) score += 1;
      return { p, score, i };
    })
    .sort((a, b) => (b.score - a.score) || (a.i - b.i));

  return scored.slice(0, limit).map((s) => s.p);
}

/** Existing posts worth linking TO from the text being written: they share
 *  words with it but are not linked from it yet. */
export function linkSuggestions(
  body: string,
  title: string,
  candidates: LinkTarget[],
  limit = 6,
): { target: LinkTarget; matched: string }[] {
  const already = new Set(extractLinks(body).map((l) => l.href));
  const haystack = `${title}\n${body}`.toLowerCase();
  const out: { target: LinkTarget; matched: string }[] = [];

  for (const t of candidates) {
    if (already.has(t.path)) continue;
    // Match on the whole label first (strongest signal), then on any
    // distinctive word from it.
    const label = t.label.toLowerCase();
    if (label.length > 3 && haystack.includes(label)) { out.push({ target: t, matched: t.label }); continue; }
    const word = tokens(t.label).find((w) => w.length > 4 && new RegExp(`\\b${w}\\b`).test(haystack));
    if (word) out.push({ target: t, matched: word });
  }
  return out.slice(0, limit);
}
