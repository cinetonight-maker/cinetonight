/* ============================================================================
 * lib/clips.ts — extra videos from a TMDB videos list.
 *
 * Its own module, with no imports, for one practical reason: lib/tmdb.ts
 * imports "./quality" without a file extension, which Next resolves and the
 * plain Node test runner does not - so nothing in tmdb.ts can be unit tested.
 * This logic decides what a visitor is offered, so it needs tests.
 * ========================================================================= */

export interface Clip {
  key: string;
  name: string;
  type: string;
}

/** Video types worth surfacing, in the order a viewer would want them. */
const CLIP_TYPES = ["Clip", "Featurette", "Behind the Scenes", "Teaser", "Trailer"];

/**
 * Everything WORTH KEEPING from a TMDB videos list, after the trailer.
 *
 * The title detail call already asks for `videos` and we were throwing all of
 * it away except one trailer key. Clips, featurettes and behind-the-scenes
 * reels are in that same response, so offering them costs no extra request.
 *
 * YouTube only (nothing else embeds), official before fan uploads, newest
 * first within a type, no duplicates, and never the trailer already playing.
 */
export function pickClips(vids: unknown, exceptKey: string | null, limit = 6): Clip[] {
  const list = Array.isArray(vids) ? (vids as Record<string, unknown>[]) : [];
  const usable = list.filter(
    (v) =>
      v && v.site === "YouTube" && typeof v.key === "string" && v.key &&
      v.key !== exceptKey && CLIP_TYPES.includes(String(v.type)),
  );
  usable.sort((a, b) => {
    const t = CLIP_TYPES.indexOf(String(a.type)) - CLIP_TYPES.indexOf(String(b.type));
    if (t) return t;
    if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
    return String(b.published_at ?? "").localeCompare(String(a.published_at ?? ""));
  });
  const seen = new Set<string>();
  return usable
    .filter((v) => (seen.has(String(v.key)) ? false : (seen.add(String(v.key)), true)))
    .slice(0, limit)
    .map((v) => ({
      key: String(v.key),
      name: String(v.name ?? v.type).slice(0, 90),
      type: String(v.type),
    }));
}

/** Best available YouTube trailer key from a TMDB videos list.
 *  Official trailer first, then any trailer, then a teaser, then anything
 *  embeddable at all. */
export function pickTrailer(vids: unknown): string | null {
  const list = Array.isArray(vids) ? (vids as Record<string, unknown>[]) : [];
  const yt = (x: Record<string, unknown>) => x && x.site === "YouTube" && typeof x.key === "string";
  const v =
    list.find((x) => yt(x) && x.type === "Trailer" && x.official) ||
    list.find((x) => yt(x) && x.type === "Trailer") ||
    list.find((x) => yt(x) && x.type === "Teaser") ||
    list.find((x) => yt(x));
  return v ? String(v.key) : null;
}
