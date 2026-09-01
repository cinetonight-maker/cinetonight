import "server-only";
import { cache } from "react";
import { supabasePublic, PUBLIC_TTL } from "./supabase/public";

/* ============================================================================
 * lib/intel.ts — read side of the V2 Movie Intelligence layer.
 *
 * One reviewed row per title in `movie_intel` (supabase/movie_intel.sql)
 * powers the V2 template's decision modules. THE ABSENCE OF A ROW IS A
 * FIRST-CLASS STATE: getIntel() returns null and every dependent module
 * hides itself — the sparse/Level-B page that the ~24k long-tail titles
 * render by design (docs/V2-BUILD-PATH.md, rule one). Nothing here may
 * invent a fallback: no row, no verdict, no Take, no fake filler.
 *
 * Values are the controlled vocabulary's PLAIN WORDS. `level` on expect
 * rows is a 1..3 ordinal for the template's qualitative dots — it is not
 * a score and must never be rendered as a number.
 * ========================================================================= */

export interface ExpectRow { label: string; value: string; level: 1 | 2 | 3 }

export interface MovieIntel {
  id: string;
  verdictHeadline: string | null;
  watchIf: string[];
  skipIf: string[];
  chips: string[];
  mood: string | null;
  pace: string | null;
  intensity: string | null;
  attention: string | null;
  themes: string[];
  vibe: string | null;
  expect: ExpectRow[];
  bestForWho: string | null;
  bestForContext: string | null;
  bestForCaution: string | null;
  takeTitle: string | null;
  takeBody: string | null;
  /** Series-only (SERIES_DETAIL_PAGE.md §5). Null on films. */
  episodeRhythm: string | null;
  hookExpectation: string | null;
  altId: string | null;
  altReasons: string[];
  editor: string;
  reviewedAt: string;
}

/** Defensive: jsonb columns arrive as unknown; only well-formed string
 *  arrays pass. A malformed row degrades to hidden modules, never a crash. */
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function expectRows(v: unknown): ExpectRow[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is ExpectRow =>
    !!r && typeof r === "object" &&
    typeof (r as ExpectRow).label === "string" &&
    typeof (r as ExpectRow).value === "string" &&
    [1, 2, 3].includes((r as ExpectRow).level),
  );
}

/** Reviewed intelligence for one title, or null (= render the sparse state).
 *
 *  cache()'d like lib/data's readers so metadata + page share one query.
 *  Uses the stable TTL: intel changes at editorial pace, and this runs on
 *  the ISR movie route — it must never shorten that page's revalidate
 *  window with a fresher fetch (the same trap the providers fetch had,
 *  see app/movie/[id]/page.tsx). Any failure — Supabase unconfigured,
 *  table missing, network — returns null: intel is additive, never
 *  load-bearing. */
export const getIntel = cache(async (id: string): Promise<MovieIntel | null> => {
  try {
    const sb = supabasePublic(PUBLIC_TTL.stable);
    if (!sb) return null;
    const { data, error } = await sb.from("movie_intel").select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    // Governance floor: an unattributed row is not publishable intelligence.
    if (typeof data.editor !== "string" || !data.editor.trim()) return null;
    return {
      id: data.id,
      verdictHeadline: data.verdict_headline ?? null,
      watchIf: strings(data.watch_if),
      skipIf: strings(data.skip_if),
      chips: strings(data.chips),
      mood: data.mood ?? null,
      pace: data.pace ?? null,
      intensity: data.intensity ?? null,
      attention: data.attention ?? null,
      themes: strings(data.themes),
      vibe: data.vibe ?? null,
      expect: expectRows(data.expect),
      bestForWho: data.best_for_who ?? null,
      bestForContext: data.best_for_context ?? null,
      bestForCaution: data.best_for_caution ?? null,
      takeTitle: data.take_title ?? null,
      takeBody: data.take_body ?? null,
      episodeRhythm: data.episode_rhythm ?? null,
      hookExpectation: data.hook_expectation ?? null,
      altId: data.alt_id ?? null,
      altReasons: strings(data.alt_reasons),
      editor: data.editor,
      reviewedAt: data.reviewed_at ?? "",
    };
  } catch {
    return null;
  }
});

/** True when the row carries enough for the Tonight Verdict module
 *  (spec 5.4 requires the sentence plus at least one honest reason each
 *  way — a headline alone renders nothing). */
export function hasVerdict(i: MovieIntel | null): i is MovieIntel {
  return !!i && !!i.verdictHeadline && i.watchIf.length > 0 && i.skipIf.length > 0;
}

/** True when the CineTonight Take may render: original analysis PLUS the
 *  accountability spec 5.9 demands (editor + review date already enforced
 *  at read time; body is the remaining gate). */
export function hasTake(i: MovieIntel | null): i is MovieIntel {
  return !!i && !!i.takeBody && !!i.reviewedAt;
}
