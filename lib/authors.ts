/* ============================================================================
 * lib/authors.ts — the people behind the content.
 *
 * WHY THIS EXISTS: every article used to be bylined "Editorial Desk", and the
 * article JSON-LD named an Organization ("CineTonight Editorial") as its
 * author. For a site whose entire proposition is trustworthy recommendations,
 * an anonymous byline is a weak signal - both to a reader deciding whether to
 * believe a release date, and to the answer engines that decide whether to
 * cite one.
 *
 * A post's author comes from its own `author` column when set, and falls back
 * to DEFAULT_AUTHOR when it is empty or the column has not been created yet
 * (see supabase/blog_author.sql). That fallback is what lets this ship before
 * anyone has touched a single existing post.
 *
 * Pure data and pure functions - no imports, safe on the client.
 * ========================================================================= */

export interface Author {
  /** URL segment: /author/<slug>. Treat as an address, never rename casually. */
  slug: string;
  name: string;
  /** Shown under the name on the author page and in the byline strip. */
  role: string;
  /** One line, used as the author page's meta description and card blurb. */
  short: string;
  /** Full bio paragraphs for the author page. */
  bio: string[];
  /** Profile URLs for schema.org sameAs. Empty until real ones exist:
   *  a fabricated sameAs is worse than none, because it points the entity
   *  graph at something that is not this person. */
  sameAs: string[];
}

export const AUTHORS: Author[] = [
  {
    slug: "shahzaib-ali",
    name: "Shahzaib Ali",
    role: "Founder",
    short: "Founder of CineTonight. Builds the product, the recommendation system and the availability data.",
    bio: [
      "Shahzaib Ali is the founder of CineTonight. He builds and runs the site, including the recommendation system and the streaming availability data behind every title page.",
      "CineTonight began with a problem he kept running into as a viewer. The catalogue was never the constraint. Finding the right thing to watch, on a service he actually had, in the time he actually had, was the constraint. Existing tools solved half of it at best, so he built the other half.",
      "He works on product direction, the discovery engine and the technical side of the site.",
    ],
    sameAs: [],
  },
  {
    slug: "syed-ahmad",
    name: "Syed Ahmad",
    role: "Writer and Editor",
    short: "Writer and editor at CineTonight, covering guides, recommendations and OTT release coverage.",
    bio: [
      "Syed Ahmad is the writer and editor at CineTonight. He is responsible for the guides, recommendation articles and release date coverage across the site.",
      "His work follows CineTonight's editorial rule on certainty: confirmed means a studio or platform announced it, reported means the trade press published it, and anything else is labelled as inference. On release date coverage in particular, that distinction is the difference between a page worth trusting and a page repeating rumour.",
      "He writes the recommendation guides from titles he has actually watched.",
    ],
    sameAs: [],
  },
];

/** Used when a post carries no author of its own. Syed Ahmad writes the blog,
 *  so an unattributed post is his by default. */
export const DEFAULT_AUTHOR_SLUG = "syed-ahmad";

const BY_SLUG = new Map(AUTHORS.map((a) => [a.slug, a]));

/** Resolve a stored author value to a real person. Accepts a slug, tolerates
 *  a full name, and never returns null - an unrecognised value falls back
 *  rather than rendering a byline for somebody who does not exist. */
export function authorFor(value?: string | null): Author {
  const key = String(value ?? "").trim().toLowerCase();
  if (key) {
    const bySlug = BY_SLUG.get(key);
    if (bySlug) return bySlug;
    const byName = AUTHORS.find((a) => a.name.toLowerCase() === key);
    if (byName) return byName;
  }
  return BY_SLUG.get(DEFAULT_AUTHOR_SLUG) ?? AUTHORS[0];
}

export const authorBySlug = (slug: string): Author | undefined => BY_SLUG.get(slug);
