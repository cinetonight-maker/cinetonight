/* ============================================================================
 * lib/genres.ts — the ONE list of genre names a browse URL may carry.
 *
 * WHY THIS FILE EXISTS (the hole it closes):
 *
 * `/movies?genre=<anything>` used to return HTTP 200 with a UNIQUE canonical
 * tag and a unique <title>, no matter what the value was. TMDB's genre lookup
 * (lib/tmdb.ts genreIdFor) returns undefined for a name it doesn't recognise,
 * so the page quietly rendered the UNFILTERED hub — same content as /movies,
 * different URL, self-canonicalising. Five browse hubs times an unlimited set
 * of values is an unbounded space of indexable duplicate pages that nothing
 * closed. It had not shown up in the index yet, which is exactly why it was
 * worth closing now rather than later.
 *
 * There were also TWO disagreeing genre lists in the codebase: the 17 names
 * the filter UI offers (components/Listing.tsx) and whatever `genresOf()`
 * happens to find in the catalogue. The sitemap used the second one, so it
 * was advertising /movies?genre=Action%20%26%20Adventure to Google — a TV-only
 * TMDB genre name that does NOT filter a movie query, i.e. the site was
 * submitting an example of the very bug described above. Both call sites now
 * read this file.
 *
 * NO NETWORK. Validation must never depend on TMDB being reachable, or a
 * TMDB outage would start redirecting perfectly good genre URLs.
 * ========================================================================= */

/** The genre names a public browse URL may carry. These are TMDB's own movie
 *  genre names (the tv-side equivalents are aliased server-side — see
 *  TV_GENRE_ALIAS in lib/tmdb.ts), which is what makes them actually filter.
 *  This is the list the filter UI offers, and the only list the sitemap may
 *  emit. */
export const BROWSE_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "History", "Horror", "Music",
  "Mystery", "Romance", "Sci-Fi", "Thriller", "War",
] as const;

export type BrowseGenre = (typeof BROWSE_GENRES)[number];

const BROWSE_SET: ReadonlySet<string> = new Set<string>(BROWSE_GENRES);

/** TMDB's TV genre names folded back onto the movie name that owns the URL.
 *  Mirrors TV_GENRE_ALIAS in lib/tmdb.ts, in the opposite direction: that map
 *  turns "Action" into "Action & Adventure" when querying TV; this one turns
 *  the TV name back into "Action" so ONE canonical URL serves both. Without
 *  it, /movies?genre=Action and /movies?genre=Action%20%26%20Adventure are two
 *  indexable pages for one genre — and the second one does not even filter. */
const TV_NAME_TO_BROWSE: Readonly<Record<string, BrowseGenre>> = {
  "Action & Adventure": "Action",
  "Sci-Fi & Fantasy": "Sci-Fi",
  "War & Politics": "War",
  // Common spellings that are the same genre by another name. Folding them
  // here means a stray link never mints a duplicate page.
  "Science Fiction": "Sci-Fi",
  "TV Movie": "Drama",
};

/** Is this exactly a canonical browse-genre name? */
export const isBrowseGenre = (value: string | undefined | null): value is BrowseGenre =>
  !!value && BROWSE_SET.has(value);

/**
 * The canonical browse genre for a raw URL value, or `undefined` if the value
 * is not a genre this site can filter by.
 *
 * - `undefined` / `""` / `"All"` → `undefined` (no filter; the bare hub)
 * - an exact browse genre        → itself
 * - a known TV/alternate name    → its browse-genre equivalent
 * - anything else                → `undefined`
 *
 * Callers treat "not undefined but different from the input" as "this URL is
 * not the canonical one" and redirect; they treat "undefined with a non-empty
 * input" as "this genre does not exist" and redirect to the bare hub.
 */
export function canonicalGenre(value: string | undefined | null): BrowseGenre | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "All") return undefined;
  if (BROWSE_SET.has(trimmed)) return trimmed as BrowseGenre;
  return TV_NAME_TO_BROWSE[trimmed];
}

/**
 * What a browse URL for this genre value SHOULD be, given the hub it is on.
 * Returns the path with its query string, ready to compare against the URL
 * that was actually requested.
 *
 * `/movies` + "Action"              → "/movies?genre=Action"
 * `/movies` + "Action & Adventure"  → "/movies?genre=Action"   (alias folded)
 * `/movies` + "made-up"             → "/movies"                (genre dropped)
 * `/movies` + undefined             → "/movies"
 */
export function canonicalBrowsePath(path: `/${string}`, value: string | undefined | null): string {
  const genre = canonicalGenre(value);
  return genre ? `${path}?genre=${encodeURIComponent(genre)}` : path;
}

/**
 * True when the requested genre value is already the canonical one — i.e. the
 * page can render as-is with no redirect. An absent/empty/"All" value is
 * canonical (it is the bare hub).
 */
export function isCanonicalGenreValue(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === "" || value === "All") return true;
  return canonicalGenre(value) === value;
}

/**
 * Title / description / canonical for a browse hub, given the raw `?genre=`
 * value off the URL.
 *
 * The logic lives HERE rather than in lib/site.ts so it can be unit-tested
 * directly — everything a test imports in this repo has to be self-contained,
 * and site.ts is not. `listingMetadata` in lib/site.ts is a thin wrapper over
 * this, kept there because that is where the five hub pages already import it
 * from.
 *
 * The important guarantee: an unrecognised genre produces the SAME title,
 * description and canonical as the bare hub. It cannot mint a unique
 * indexable page. That was the bug.
 */
export function genreListingMeta(opts: {
  path: `/${string}`;
  baseTitle: string;
  baseDescription: string;
  genre?: string | null;
}): { title: string; description: string; alternates: { canonical: string } } {
  const { path, baseTitle, baseDescription, genre } = opts;
  const canonical = canonicalGenre(genre);
  if (!canonical) {
    return { title: baseTitle, description: baseDescription, alternates: { canonical: path } };
  }
  return {
    title: `${canonical} ${baseTitle}`,
    description: `${canonical} picks: ${baseDescription}`,
    alternates: { canonical: `${path}?genre=${encodeURIComponent(canonical)}` },
  };
}
