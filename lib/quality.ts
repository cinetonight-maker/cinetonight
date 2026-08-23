import type { Movie, MovieKind } from "./types";

/* ============================================================================
 * lib/quality.ts — THE single source of truth for catalogue data quality.
 *
 * Phase 2 (Catalogue & Data Quality). Every rule about what counts as valid
 * data, how ratings rank, which titles deserve discovery placement, and how
 * missing fields display lives HERE — no page or component invents its own.
 *
 * Everything in this file is a pure, dependency-free transform of data the
 * caller already has in memory. Nothing here fetches, caches, or touches
 * Phase 1 infrastructure.
 * ========================================================================= */

/* ---------------------------------------------------------------------------
 * Years & release status
 * ------------------------------------------------------------------------ */

/** First commercial film screening was 1895; allow a small margin for
 *  festival/announced titles dated a couple of years out. */
const YEAR_MIN = 1895;
const yearMax = () => new Date().getFullYear() + 3;

/** A usable display/render year, or null. Rejects the mapped `0` that old
 *  records carry, NaN, and absurd values. */
export function validYear(y: unknown): number | null {
  const n = typeof y === "number" ? y : Number(y);
  if (!Number.isInteger(n) || n < YEAR_MIN || n > yearMax()) return null;
  return n;
}

export type ReleaseStatus = "released" | "upcoming" | "unknown";

/** Released / upcoming / unknown — from the full date when we have one,
 *  falling back to the year alone. Copy that talks about how a title "was
 *  received" MUST check this first (see factualAbout). */
export function releaseStatus(m: { year?: number | null; releaseDate?: string | null }): ReleaseStatus {
  const today = new Date().toISOString().slice(0, 10);
  const d = m.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate) ? m.releaseDate : null;
  if (d) return d <= today ? "released" : "upcoming";
  const y = validYear(m.year);
  if (y === null) return "unknown";
  const thisYear = new Date().getFullYear();
  if (y < thisYear) return "released";
  if (y > thisYear) return "upcoming";
  return "unknown"; // this year, no exact date — cannot safely claim either
}

/* ---------------------------------------------------------------------------
 * Media type normalization
 * ------------------------------------------------------------------------ */

/** One normalizer for every place a media type enters the system. Internal
 *  values are exactly "movie" | "series"; anything unrecognized is null so
 *  callers must handle it instead of silently defaulting. */
export function normalizeKind(v: unknown): MovieKind | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (["movie", "film", "feature", "m"].includes(s)) return "movie";
  if (["series", "tv", "show", "webseries", "web-series", "web series", "t", "tv_series", "tvshow"].includes(s)) return "series";
  return null;
}

/* ---------------------------------------------------------------------------
 * Ratings — display rules and confidence-aware ranking
 * ------------------------------------------------------------------------ */

/** Votes required before a rating is trusted for RANKING (not display).
 *  Series accumulate fewer TMDB votes than films, so their bar is lower. */
export const RANK_MIN_VOTES: Record<MovieKind, number> = { movie: 50, series: 20 };

/** Bayesian shrinkage weight (IMDb-style): how many "virtual votes" at the
 *  pool average a title must overcome. Higher = more votes needed before a
 *  high average is believed. */
export const BAYES_M: Record<MovieKind, number> = { movie: 500, series: 200 };

/** True when a rating is real enough to SHOW (any votes at all). */
export function hasDisplayableRating(m: { rating?: number; votes?: number }): boolean {
  const r = Number(m.rating);
  return Number.isFinite(r) && r > 0 && (m.votes ?? 0) > 0;
}

/** Display string for a rating, or null to hide the field entirely.
 *  Never returns "0.0", "NaN", or a rating fabricated from zero votes. */
export function displayRating(m: { rating?: number; votes?: number }): string | null {
  return hasDisplayableRating(m) ? Number(m.rating).toFixed(1) : null;
}

/** IMDb weighted rating: WR = (v/(v+m))·R + (m/(v+m))·C
 *  R = title's average, v = its votes, C = pool mean, m = BAYES_M[kind].
 *  A 10.0-from-2-votes title shrinks to ~C; an 8.7-from-30k title barely
 *  moves. */
export function weightedRating(t: { rating?: number; votes?: number; kind: MovieKind }, poolMean: number): number {
  const R = Number(t.rating) || 0;
  const v = Math.max(0, t.votes ?? 0);
  const m = BAYES_M[t.kind] ?? BAYES_M.movie;
  if (v === 0 || R <= 0) return 0;
  return (v / (v + m)) * R + (m / (v + m)) * poolMean;
}

/** Confidence-aware "Top Rated" ordering for an in-memory list.
 *  - titles below RANK_MIN_VOTES are excluded from ranking entirely
 *  - the pool mean C is computed from the qualifying titles themselves
 *    (falls back to 6.5, roughly TMDB's global mean, for tiny pools)
 *  - pure re-sort of data already fetched: zero extra requests. */
export function rankByWeightedRating<T extends { rating?: number; votes?: number; kind: MovieKind }>(list: T[]): T[] {
  const qualified = list.filter((t) => hasDisplayableRating(t) && (t.votes ?? 0) >= (RANK_MIN_VOTES[t.kind] ?? 50));
  const mean = qualified.length >= 5
    ? qualified.reduce((a, t) => a + (Number(t.rating) || 0), 0) / qualified.length
    : 6.5;
  return [...qualified].sort((a, b) => weightedRating(b, mean) - weightedRating(a, mean));
}

/* ---------------------------------------------------------------------------
 * Catalogue quality tiers
 * ------------------------------------------------------------------------ */

export type Tier = "A" | "B" | "C";

/** Minimum vote signal for discovery placement (Tier A). */
export const TIER_A_MIN_VOTES: Record<MovieKind, number> = { movie: 50, series: 20 };

const hasRealTitle = (t: unknown) =>
  typeof t === "string" && t.trim().length > 0 && t.trim().toLowerCase() !== "untitled";
const hasOverview = (d: unknown) =>
  typeof d === "string" && d.trim().length >= 40 && !/^no synopsis/i.test(d.trim());

/** Tier A — discovery quality: may appear on homepage, Trending, Top Rated,
 *  Latest, genre shelves, recommendations, premium browse surfaces.
 *  Tier B — long-tail: searchable and reachable by direct URL, never
 *  dominates discovery shelves.
 *  Tier C — weak/junk: never promoted anywhere (still never deleted;
 *  noindex is a Phase 4/SEO decision). */
export function titleTier(m: Partial<Movie> & { kind?: MovieKind | null }): Tier {
  const kind = m.kind ? normalizeKind(m.kind) : null;
  if (!hasRealTitle(m.title) || !kind) return "C";
  const poster = Boolean(m.posterPath);
  const overview = hasOverview(m.desc);
  if (!poster && !overview) return "C";

  const year = validYear(m.year) !== null || releaseStatus(m) === "upcoming";
  const votes = m.votes ?? 0;
  const signal = votes >= (TIER_A_MIN_VOTES[kind] ?? 50)
    // An upcoming title can't have votes yet — a poster + overview + valid
    // future date is itself the signal that this is a real, tracked release.
    || (releaseStatus(m) === "upcoming" && poster && overview);
  if (poster && overview && year && signal) return "A";
  return "B";
}

export const isDiscoveryQuality = (m: Partial<Movie>) => titleTier(m) === "A";

/** Filter a shelf to discovery quality — with a floor so a strict filter can
 *  never blank out a shelf: if fewer than `minKeep` Tier-A titles survive,
 *  Tier B titles top the list back up (Tier C never appears). */
export function discoveryFilter<T extends Partial<Movie>>(list: T[], minKeep = 4): T[] {
  const a = list.filter((m) => titleTier(m) === "A");
  if (a.length >= minKeep) return a;
  const b = list.filter((m) => titleTier(m) === "B");
  return [...a, ...b].slice(0, Math.max(minKeep, a.length));
}

/* ---------------------------------------------------------------------------
 * Latest — freshness-aware eligibility
 * ------------------------------------------------------------------------ */

/** Votes that make a release unquestionably real for the Latest shelf. */
export const LATEST_MIN_VOTES = 10;
/** Popularity that rescues a brand-new release before votes accumulate.
 *  TMDB popularity is traffic-driven and reacts within hours of a real
 *  release; junk records sit near zero. */
export const LATEST_RESCUE_MIN_POPULARITY = 20;
/** The rescue only applies to genuinely recent releases. */
export const LATEST_RESCUE_MAX_AGE_DAYS = 14;

/** Eligibility for the Latest shelf:
 *    votes >= 10                                   (proven release), OR
 *    popularity >= 20 AND poster AND real overview
 *      AND released AND release date within 14 days (day-one rescue).
 *  The rescue path can never admit a future title (releaseStatus must be
 *  "released") or an old popular title (the 14-day window). */
export function latestEligible(m: Partial<Movie> & { kind?: MovieKind | null }): boolean {
  if ((m.votes ?? 0) >= LATEST_MIN_VOTES) return true;
  if ((m.popularity ?? 0) < LATEST_RESCUE_MIN_POPULARITY) return false;
  if (!m.posterPath || !hasOverview(m.desc)) return false;
  if (releaseStatus(m) !== "released") return false;
  // Recency requires an exact date — a year alone cannot prove "this week".
  if (!m.releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(m.releaseDate)) return false;
  const ageMs = Date.now() - new Date(m.releaseDate + "T00:00:00Z").getTime();
  return ageMs >= 0 && ageMs <= LATEST_RESCUE_MAX_AGE_DAYS * 86400_000;
}

/* ---------------------------------------------------------------------------
 * Field display helpers — hide, never fake
 * ------------------------------------------------------------------------ */

/** Generic: turns placeholder junk ("—", "", "N/A", "null", "undefined")
 *  into null so the UI can skip the row instead of printing it. */
export function displayField(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || ["—", "-", "n/a", "na", "null", "undefined", "unknown"].includes(s.toLowerCase())) return null;
  return s;
}

/** Runtime for display, or null. Rejects "—", "0 min", "0h 00m", NaN forms. */
export function displayRuntime(runtime: unknown): string | null {
  const s = displayField(runtime);
  if (!s) return null;
  if (/nan/i.test(s)) return null;
  if (/^0\s*(min|m)\b/i.test(s)) return null;
  if (/^0h\s*0?0m$/i.test(s)) return null;
  return s;
}

/** Certification for display, or null. "NR" means "we don't know" — hide it
 *  rather than presenting it as a real certificate. */
export function displayCert(cert: unknown): string | null {
  const s = displayField(cert);
  if (!s || s.toUpperCase() === "NR") return null;
  return s;
}

/** Comma-joined people fields ("A, B, C") cleaned for display, or null.
 *  Drops placeholder entries so prose never renders "— — —". */
export function displayPeople(v: unknown): string | null {
  const s = displayField(v);
  if (!s) return null;
  const people = s.split(",").map((p) => p.trim()).filter((p) => p && p !== "—" && p !== "-");
  return people.length ? people.join(", ") : null;
}

/* ---------------------------------------------------------------------------
 * Factual-only "About" prose
 * ------------------------------------------------------------------------ */

/** Build the detail page's About paragraphs from VERIFIED data only.
 *  - no invented audience/critic reception, ever
 *  - upcoming titles get factual future wording only
 *  - missing fields drop out of the sentence instead of breaking it. */
export function factualAbout(m: Movie): string[] {
  const out: string[] = [];
  if (m.desc && !/^no synopsis/i.test(m.desc)) out.push(m.desc);

  const status = releaseStatus(m);
  const isSeries = m.kind === "series";
  const noun = isSeries ? "series" : "film";
  const genre = (m.genres ?? []).filter(Boolean).slice(0, 2).join(" and ").toLowerCase();
  const director = displayPeople(m.director);
  const stars = (m.cast ?? []).slice(0, 3).map((c) => c.name).filter(Boolean);
  const year = validYear(m.year);
  const runtime = displayRuntime(m.runtime);

  // Sentence 1: what it is + who made it + who's in it (only real names).
  const parts: string[] = [];
  parts.push(`${m.title} is ${genre ? `a ${genre} ${noun}` : `a ${noun}`}${year && status === "released" ? ` from ${year}` : ""}`);
  if (director) parts.push(`${isSeries ? "created" : "directed"} by ${director}`);
  if (stars.length) parts.push(`starring ${stars.join(", ")}`);
  out.push(parts.join(", ") + ".");

  // Sentence 2: strictly factual stats — rating only when it really exists,
  // future wording only for future titles.
  const facts: string[] = [];
  if (status === "upcoming") {
    facts.push(
      m.releaseDate
        ? `It is scheduled to release on ${new Date(m.releaseDate + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}.`
        : year
          ? `It is expected to release in ${year}.`
          : `A release date has not been announced yet.`,
    );
  } else {
    const rating = displayRating(m);
    if (rating && (m.votes ?? 0) >= 20) {
      facts.push(`It holds a ${rating}/10 rating on TMDB from ${(m.votes ?? 0).toLocaleString("en-US")} votes.`);
    }
    if (runtime) facts.push(isSeries ? `The series runs for ${runtime.toLowerCase()}.` : `The runtime is ${runtime}.`);
  }
  if (facts.length) out.push(facts.join(" "));
  return out;
}
