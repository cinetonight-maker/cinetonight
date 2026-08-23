/* ============================================================================
 * lib/personUrl.ts — ONE URL per person.
 *
 * THE PROBLEM THIS CLOSES (from docs/SEO-ARCHITECTURE-AUDIT.md, §0):
 *
 * /person/[id] accepted an unlimited number of URLs for the same human being:
 *
 *   /person/shah-rukh-khan                    ← what the SITEMAP emitted
 *   /person/tmdb-p-35742-shah-rukh-khan       ← what every INTERNAL LINK emits
 *   /person/tmdb-p-35742                      ← bare id, also renders
 *   /person/tmdb-p-35742-anything-at-all      ← the slug is not validated
 *
 * All of them returned 200, none carried a canonical tag, and none redirected.
 * /movie/[id] has solved this since day one (permanentRedirect at line ~108);
 * /person/[id] never got the same treatment, and person pages were 46% of the
 * indexed sample as a result.
 *
 * This module is PURE — no network, no React, no Next — so the rule can be
 * unit-tested directly (tests/personUrl.test.mjs) instead of only through a
 * rendered page.
 * ========================================================================= */

/** THE slug rule for person URLs.
 *
 *  This used to exist twice — `seoSlug` in lib/tmdb.ts (which builds the link
 *  URLs) and `personId` in lib/data.ts (which resolves them). Two copies of
 *  the rule that decides whether a URL is canonical is a redirect loop waiting
 *  to happen: the moment they disagree, the page redirects to a spelling that
 *  redirects back. Both now import from here, so there is one rule and drift
 *  is impossible rather than merely tested for. */
export const personSlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Read a person id back out of a URL segment. Lives next to the builder on
 *  purpose: the parser has to accept everything the builder can produce, and
 *  keeping them apart is how the two drifted in the first place.
 *
 *  Deliberately tolerant of the trailing slug — `tmdb-p-35742` and
 *  `tmdb-p-35742-shah-rukh-khan` both resolve to the same person, which is
 *  what makes the redirect above necessary. */
export function parsePersonTmdbId(slug: string): string | null {
  const m = /^tmdb-p-(\d+)(?:-[a-z0-9-]*)?$/.exec(slug);
  return m ? m[1] : null;
}

/**
 * The one id a person's page should live at.
 *
 * A TMDB id wins whenever we have one, because that is the form every cast
 * link on the site already uses AND the only form that works for people who
 * are not in the small curated catalogue. The name form is the fallback for a
 * catalogue person with no TMDB id.
 *
 * The name suffix is decorative — `parsePersonTmdbId` ignores it — but it is
 * part of the canonical URL so the address is readable and matches the links.
 * A name that slugs to nothing (punctuation only) is dropped rather than
 * producing a trailing hyphen, which would otherwise be a second URL that
 * canonicalises to itself forever.
 */
export function canonicalPersonId(opts: { tmdbId?: number | string | null; name: string }): string {
  const slug = personSlug(opts.name);
  if (opts.tmdbId !== undefined && opts.tmdbId !== null && String(opts.tmdbId) !== "") {
    return `tmdb-p-${opts.tmdbId}` + (slug ? `-${slug}` : "");
  }
  return slug;
}

/**
 * Should the request at `requestedId` be redirected, and where to?
 * Returns `null` when the URL is already canonical.
 *
 * Deliberately compares the WHOLE id, not just the numeric part: that is what
 * collapses `/person/tmdb-p-35742-anything-at-all` and the bare
 * `/person/tmdb-p-35742` onto the single canonical address.
 */
export function personRedirectTarget(
  requestedId: string,
  person: { tmdbId?: number | string | null; name: string },
): string | null {
  const canonical = canonicalPersonId(person);
  // An empty canonical would mean "redirect to /person/", which is not a page.
  // Better to serve the URL as-is than to send a visitor into a dead end.
  if (!canonical) return null;
  return canonical === requestedId ? null : `/person/${canonical}`;
}
