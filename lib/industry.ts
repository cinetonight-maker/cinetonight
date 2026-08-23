import type { Movie } from "./types";
import { titleTier } from "./quality.ts";

/* ============================================================================
 * lib/industry.ts — industry classification + mixed-discovery balancing.
 *
 * Phase 3. Pure, dependency-light helpers (no fetching here).
 *
 * CLASSIFICATION LIMITATION (documented per the Phase 3 brief §16): TMDB does
 * not label titles "Hollywood"/"Bollywood". The strongest per-title signal we
 * consistently have is the ORIGINAL LANGUAGE (mapped into Movie.language by
 * lib/tmdb — an ISO code like "HI" for list hits, or an English name like
 * "Hindi" for detail fetches). Language is a proxy, not a guarantee: an
 * English-language Australian film classifies as "hollywood" (major
 * international English cinema), and a Hindi-dubbed record with wrong TMDB
 * metadata will follow its metadata. Region-biased POOLS (with_origin_country
 * / with_original_language queries in lib/tmdb) are therefore the primary
 * mechanism for building shelves; this classifier is for mixing/labelling
 * titles we already have. Never classify from title text.
 * ========================================================================= */

export type Industry = "hollywood" | "bollywood" | "south" | "korean" | "international";

const LANG_MAP: Record<string, Industry> = {
  // ISO 639-1 codes (list-hit mapping stores these uppercased; we lowercase)
  en: "hollywood",
  hi: "bollywood",
  te: "south", ta: "south", ml: "south", kn: "south",
  ko: "korean",
  // English names (detail-fetch mapping stores spoken_languages english_name)
  english: "hollywood",
  hindi: "bollywood",
  telugu: "south", tamil: "south", malayalam: "south", kannada: "south",
  korean: "korean",
};

/** Countries whose English-language output we classify as "Hollywood /
 *  major international" — the US studio system. Kept to US deliberately:
 *  GB/AU/CA/NZ English cinema classifies as International when we KNOW the
 *  origin country. */
const HOLLYWOOD_COUNTRIES = new Set(["US"]);

/** Best-effort industry classification. Precedence (Phase 3 correction §3):
 *
 *  1. A definitive LANGUAGE always wins: Hindi → bollywood,
 *     Telugu/Tamil/Malayalam/Kannada → south, Korean → korean — regardless
 *     of any country data. (Hindi can NEVER become Hollywood.)
 *  2. English + KNOWN origin country: US → hollywood; any other known
 *     country → international.
 *  3. English + NO usable country data: hollywood — the DOCUMENTED
 *     FALLBACK. TMDB movie LIST objects do not carry origin/production
 *     country (only TV list hits expose origin_country, and detail calls
 *     expose production_countries), and we never add per-title detail
 *     requests just to classify (no N+1) — so most movie list hits take
 *     this fallback.
 *  4. Anything else → international.
 *
 *  Never classified from title text. Deterministic. */
export function industryOf(m: Pick<Movie, "language"> & { originCountry?: string | null }): Industry {
  const lang = String(m.language ?? "").trim().toLowerCase();
  const byLang = LANG_MAP[lang];
  if (byLang && byLang !== "hollywood") return byLang; // definitive languages
  if (byLang === "hollywood") {
    const country = String(m.originCountry ?? "").trim().toUpperCase();
    if (!country) return "hollywood"; // documented fallback (no country data)
    return HOLLYWOOD_COUNTRIES.has(country) ? "hollywood" : "international";
  }
  return "international";
}

/** Default mixed-discovery guideline (Phase 3 §14) — guidelines, not quotas:
 *  ~45% Hollywood/major international, ~25% Bollywood/Hindi, ~20% South
 *  Indian, ~10% Korean + other international. Quality always wins: when a
 *  category lacks Tier-A titles, stronger eligible content fills the space. */
export const MIX_WEIGHTS: Record<Exclude<Industry, "international">, number> & { international: number } = {
  hollywood: 0.45,
  bollywood: 0.25,
  south: 0.20,
  korean: 0.05,
  international: 0.05,
};

export interface MixPools {
  hollywood?: Movie[];
  bollywood?: Movie[];
  south?: Movie[];
  korean?: Movie[];
  international?: Movie[];
}

/** Blend per-industry pools into one shelf of `total` titles.
 *
 *  - Each pool is assumed already quality-filtered by the caller
 *    (discoveryFilter); a Tier C title is dropped here again as a backstop.
 *  - Quotas come from MIX_WEIGHTS; any shortfall in one category is filled
 *    by the remaining strongest titles from the other pools, in pool order —
 *    weak titles are never inserted just to hit a percentage.
 *  - Deterministic: no randomness (cache-safe for server-rendered shelves).
 *  - Dedupes by id across pools. */
export function mixDiscovery(pools: MixPools, total = 10): Movie[] {
  const order: Industry[] = ["hollywood", "bollywood", "south", "korean", "international"];
  const clean: Record<Industry, Movie[]> = {
    hollywood: [], bollywood: [], south: [], korean: [], international: [],
  };
  const seen = new Set<string>();
  for (const ind of order) {
    for (const m of pools[ind] ?? []) {
      if (seen.has(m.id) || titleTier(m) === "C") continue;
      seen.add(m.id);
      clean[ind].push(m);
    }
  }

  // Apportion slots so they sum to EXACTLY `total` (largest-remainder
  // method). The previous Math.round-per-category version could inflate the
  // big quotas to `total` on their own, and the final slice then truncated
  // the tail — silently zeroing Korean AND International (caught in the
  // Phase 3 correction audit).
  const quota: Record<Industry, number> = { hollywood: 0, bollywood: 0, south: 0, korean: 0, international: 0 };
  let assigned = 0;
  const remainders: [Industry, number][] = [];
  for (const ind of order) {
    const exact = MIX_WEIGHTS[ind] * total;
    quota[ind] = Math.floor(exact);
    assigned += quota[ind];
    remainders.push([ind, exact - quota[ind]]);
  }
  // Distribute leftover slots by largest remainder; ties break by the
  // REVERSE of pool order so small categories win ties against Hollywood
  // (which already holds the largest base quota). Deterministic.
  remainders.sort((a, b) => b[1] - a[1] || order.indexOf(b[0]) - order.indexOf(a[0]));
  for (let i = 0; assigned < total && i < remainders.length; i++, assigned++) quota[remainders[i][0]]++;

  // Representation guarantee: every category that HAS eligible titles gets
  // at least one slot (when there are enough slots for that), taking the
  // slot from the largest-quota category. This is what keeps the "final
  // 10%" genuinely containing Korean AND other International titles —
  // quality permitting; an empty pool is never back-filled with junk.
  const nonEmpty = order.filter((ind) => clean[ind].length > 0);
  if (total >= nonEmpty.length) {
    for (const ind of nonEmpty) {
      if (quota[ind] > 0) continue;
      const donor = [...order].sort((a, b) => quota[b] - quota[a])[0];
      if (quota[donor] > 1) { quota[donor]--; quota[ind] = 1; }
    }
  }

  // Emit PROPORTIONALLY INTERLEAVED rather than grouped: each category's
  // items are spread evenly across the output, so ANY PREFIX of the result
  // keeps roughly the target mix. This matters because display components
  // may show fewer cards than they were handed (e.g. an 8-card grid from a
  // 10-title mix) — with grouped output a prefix slice would cut exactly
  // the small categories at the tail (the bug this rewrite fixes).
  const picked: { m: Movie; pos: number; ord: number }[] = [];
  for (const ind of order) {
    const items = clean[ind].splice(0, quota[ind]);
    items.forEach((m, j) => picked.push({ m, pos: (j + 0.5) / items.length, ord: order.indexOf(ind) }));
  }
  picked.sort((a, b) => a.pos - b.pos || a.ord - b.ord);
  const out: Movie[] = picked.map((p) => p.m);
  // Shortfall (a pool had fewer titles than its quota): fill with the
  // strongest leftovers, pool order — never junk, never Tier C.
  for (const ind of order) {
    while (out.length < total && clean[ind].length) out.push(clean[ind].shift() as Movie);
  }
  return out.slice(0, total);
}
