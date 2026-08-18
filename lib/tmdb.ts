import type { Movie, MovieKind } from "./types";

/**
 * Server-side TMDB access. The API key never reaches the browser — search goes
 * through /api/search, and detail pages fetch during server rendering.
 *
 * Set TMDB_API_KEY (or TMDB_READ_TOKEN) in .env.local, and in your host's
 * environment variables when you deploy.
 */
const API = "https://api.themoviedb.org/3";
const KEY = process.env.TMDB_API_KEY?.trim();
const TOKEN = process.env.TMDB_READ_TOKEN?.trim();

export const tmdbConfigured = Boolean(KEY || TOKEN);

/** Ids for titles that aren't in the local catalogue. With a title, the id
 *  carries an SEO slug — "tmdb-m-1234-captain-america" — so every URL a
 *  card links to contains the movie's NAME, not just a number (keywords in
 *  the URL + a human-readable link in search results). The parser accepts
 *  both slugged and legacy bare ids, so nothing already indexed or saved
 *  (watchlists, old links) ever breaks. */
const seoSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
export const tmdbId = (kind: MovieKind, id: number | string, title?: string) =>
  `tmdb-${kind === "series" ? "t" : "m"}-${id}` + (title ? `-${seoSlug(title)}` : "");
export function parseTmdbId(slug: string): { kind: MovieKind; id: string } | null {
  const m = /^tmdb-(m|t)-(\d+)(?:-[a-z0-9-]*)?$/.exec(slug);
  return m ? { kind: m[1] === "t" ? "series" : "movie", id: m[2] } : null;
}

/** Same idea, for a person who isn't in the local catalogue's cast list. */
export const personTmdbId = (id: number | string, name?: string) =>
  `tmdb-p-${id}` + (name ? `-${seoSlug(name)}` : "");
export function parsePersonTmdbId(slug: string): string | null {
  const m = /^tmdb-p-(\d+)(?:-[a-z0-9-]*)?$/.exec(slug);
  return m ? m[1] : null;
}

/* ---------------------------------------------------------------------------
 * Caching policy for TMDB responses.
 *
 * WHY THIS IS TIERED RATHER THAN ONE FLAT NUMBER: every distinct TMDB URL we
 * fetch with `next: { revalidate }` becomes ONE persisted entry in Next's data
 * cache, which on Cloudflare lives in the R2 incremental-cache bucket. Each
 * time its TTL lapses and the URL is requested again, that entry is REWRITTEN
 * - an R2 Class A (write) operation, the most expensive unit in this stack.
 * A single flat 6h TTL meant every URL we had ever touched was rewritten up
 * to 4x a day, forever, for data that mostly never changes (a 2013 film's
 * cast list is history; today's trending list is not).
 *
 * So TTL now follows how volatile the data actually is. Longer TTL on stable
 * data is a straight cost win with no freshness cost to the visitor.
 * ------------------------------------------------------------------------- */
const TTL = {
  /** Title/person detail, credits, images: effectively immutable history. */
  stable: 60 * 60 * 72, // 3 days
  /** Discover/genre/language lists and watch providers: shift slowly. */
  steady: 60 * 60 * 24, // 1 day
  /** Trending, now playing, on the air, popular, upcoming: genuinely daily. */
  fresh: 60 * 60 * 6, // 6 hours
  /** Free-text search: many one-off keys, so keep them short-lived. */
  search: 60 * 60, // 1 hour
} as const;

function ttlFor(path: string): number {
  if (path.startsWith("/search/")) return TTL.search;
  if (/^\/(trending|movie\/now_playing|movie\/upcoming|movie\/popular|tv\/popular|tv\/on_the_air|tv\/airing_today)/.test(path)) {
    return TTL.fresh;
  }
  if (path.startsWith("/discover/") || path.includes("/watch/providers")) return TTL.steady;
  return TTL.stable; // /movie/{id}, /tv/{id}, /person/{id}, credits, images
}

/** Per-isolate request memo. Collapses identical TMDB calls made inside the
 *  same render (and by consecutive requests on the same warm isolate) into
 *  one network call and one cache lookup - saving both CPU and R2 READ
 *  operations. Deliberately small and short-lived: a hot-path optimisation,
 *  never a source of truth, and it never persists anywhere. */
const memo = new Map<string, { at: number; data: unknown }>();
const MEMO_MS = 60_000;
const MEMO_MAX = 300;

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  opts: { noStore?: boolean } = {},
): Promise<T | null> {
  if (!tmdbConfigured) return null;
  const url = new URL(API + path);
  if (KEY) url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  // Memo key deliberately excludes the credential, so nothing sensitive is
  // held in memory or ever logged.
  const memoKey = path + "?" + new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => [k, String(v)] as [string, string]),
  ).toString();
  const hit = memo.get(memoKey);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.data as T;

  try {
    const res = await fetch(url, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}`, accept: "application/json" } : undefined,
      // noStore keeps the response OUT of the persisted data cache entirely
      // (used for unbounded key spaces like free-text search).
      ...(opts.noStore ? { cache: "no-store" as const } : { next: { revalidate: ttlFor(path) } }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    if (memo.size >= MEMO_MAX) memo.clear(); // cheap bound, no LRU bookkeeping
    memo.set(memoKey, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function runtimeOf(kind: MovieKind, d: any): string {
  if (kind === "series") {
    const n = d.number_of_seasons ?? 1;
    return `${n} Season${n === 1 ? "" : "s"}`;
  }
  const mins = d.runtime ?? 0;
  return mins ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : "—";
}
function certOf(kind: MovieKind, d: any): string {
  const list = (kind === "series" ? d.content_ratings?.results : d.release_dates?.results) ?? [];
  for (const code of ["IN", "US", "GB"]) {
    const hit = list.find((r: any) => r.iso_3166_1 === code);
    const cert = kind === "series" ? hit?.rating : hit?.release_dates?.map((x: any) => x.certification).find((c: string) => c);
    if (cert) return cert;
  }
  return "NR";
}

/** Map a TMDB search hit to a lightweight Movie (enough for a card). */
function fromSearchHit(hit: any): Movie | null {
  const kind: MovieKind = hit.media_type === "tv" || hit.first_air_date ? "series" : "movie";
  const title = hit.title || hit.name;
  if (!title) return null;
  const date = String(hit.release_date || hit.first_air_date || "");
  return {
    id: tmdbId(kind, hit.id, title),
    tmdbId: hit.id,
    title,
    year: Number(date.slice(0, 4)) || 0,
    genres: [],
    kind,
    rating: Number((hit.vote_average ?? 0).toFixed(1)),
    votes: hit.vote_count ?? 0,
    runtime: "—",
    cert: "NR",
    language: (hit.original_language || "").toUpperCase(),
    director: "—",
    writers: "—",
    cast: [],
    desc: hit.overview || "No synopsis available yet.",
    posterPath: hit.poster_path || null,
    backdropPath: hit.backdrop_path || null,
  };
}

/** Live search across films + series. */
export async function searchTmdb(query: string, limit = 24): Promise<Movie[]> {
  const q = query.trim();
  if (!q) return [];
  // noStore: arbitrary user queries are an unbounded key space, and every
  // distinct one used to become its own PERSISTED entry in the R2 cache -
  // permanent storage inventory for a string somebody typed once. The
  // in-isolate memo in get() still collapses repeats within a minute, and
  // /api/search is dynamic anyway, so nothing is lost but the R2 objects.
  const data = await get<any>("/search/multi", { query: q, include_adult: "false", page: 1 }, { noStore: true });
  if (!data?.results) return [];
  return data.results
    .filter((r: any) => r.media_type === "movie" || r.media_type === "tv")
    .map(fromSearchHit)
    .filter(Boolean)
    .sort((a: Movie, b: Movie) => (b.votes ?? 0) - (a.votes ?? 0))
    .slice(0, limit) as Movie[];
}

/** Find one movie by title + year — used by the Free Classics shelf to
 *  auto-resolve real TMDB posters/data for films whose curated entry has
 *  no tmdbId. Year-filtered first (so "Mahal" finds the 1949 Madhubala
 *  film, not a 2020s one); if that misses (TMDB release years sometimes
 *  differ by one from the commonly-cited year), falls back to an
 *  unfiltered search but only accepts a hit within ±1 year. */
export async function findMovieTmdb(title: string, year?: number): Promise<Movie | null> {
  const q = title.trim();
  if (!q) return null;
  if (year) {
    const exact = await get<any>("/search/movie", { query: q, primary_release_year: year, include_adult: "false", page: 1 });
    const hit = exact?.results?.[0];
    if (hit) return fromSearchHit({ ...hit, media_type: "movie" });
    const loose = await get<any>("/search/movie", { query: q, include_adult: "false", page: 1 });
    const near = (loose?.results ?? []).find((r: any) => {
      const y = Number(String(r.release_date || "").slice(0, 4));
      return y && Math.abs(y - year) <= 1;
    });
    return near ? fromSearchHit({ ...near, media_type: "movie" }) : null;
  }
  const d = await get<any>("/search/movie", { query: q, include_adult: "false", page: 1 });
  const hit = d?.results?.[0];
  return hit ? fromSearchHit({ ...hit, media_type: "movie" }) : null;
}

/** Full details for a title that isn't in the local catalogue. */
export async function fetchTitle(kind: MovieKind, id: string): Promise<Movie | null> {
  const isTv = kind === "series";
  const d = await get<any>(isTv ? `/tv/${id}` : `/movie/${id}`, {
    append_to_response: isTv ? "credits,content_ratings,videos" : "credits,release_dates,videos",
  });
  if (!d) return null;

  const crew = d.credits?.crew ?? [];
  const director = isTv
    ? (d.created_by?.map((c: any) => c.name).join(", ") || "—")
    : (crew.filter((c: any) => c.job === "Director").map((c: any) => c.name).join(", ") || "—");
  const writers = [...new Set(crew.filter((c: any) => ["Writer", "Screenplay", "Story"].includes(c.job)).map((c: any) => c.name))] as string[];
  const date = String(isTv ? d.first_air_date : d.release_date ?? "");

  return {
    id: tmdbId(kind, id, (isTv ? d.name : d.title) || undefined),
    tmdbId: Number(id),
    title: (isTv ? d.name : d.title) || "Untitled",
    year: Number(date.slice(0, 4)) || 0,
    genres: (d.genres ?? []).map((g: any) => g.name).slice(0, 3),
    kind,
    rating: Number((d.vote_average ?? 0).toFixed(1)),
    votes: d.vote_count ?? 0,
    runtime: runtimeOf(kind, d),
    cert: certOf(kind, d),
    language: d.spoken_languages?.[0]?.english_name || (d.original_language || "").toUpperCase() || "—",
    director,
    writers: writers.slice(0, 3).join(", ") || director,
    cast: (d.credits?.cast ?? []).slice(0, 10).map((c: any) => ({
      name: c.name, character: c.character || "Cast", profilePath: c.profile_path || null, tmdbId: c.id,
    })),
    desc: d.overview || "No synopsis available yet.",
    posterPath: d.poster_path || null,
    backdropPath: d.backdrop_path || null,
    trailerKey: pickTrailer(d.videos?.results ?? []),
  };
}

/** Resolve a cast member's TMDB person id by name — for cast rows that came
 *  from the local catalogue (or an older sync) without a stored tmdbId, so
 *  their person page can still be filled out with real, live filmography
 *  instead of just the 1-2 titles that happen to be in the local
 *  catalogue. TMDB's own relevance/popularity ranking on this endpoint
 *  means the first hit is almost always the right person for a well-known
 *  cast credit's exact name. */
export async function searchPersonTmdb(name: string): Promise<number | null> {
  const data = await get<any>("/search/person", { query: name, include_adult: "false", page: 1 });
  return data?.results?.[0]?.id ?? null;
}

/** A cast member resolved live from TMDB, for /person/tmdb-p-<id> — people
 *  who only appear in on-demand-fetched titles (fetchTitle above) aren't in
 *  the local catalogue's peopleOf() list, so app/person/[id]/page.tsx falls
 *  back to this when the local lookup misses. */
export async function fetchPerson(id: string): Promise<{ name: string; character: string; profilePath: string | null; credits: Movie[] } | null> {
  const d = await get<any>(`/person/${id}`, { append_to_response: "combined_credits" });
  if (!d?.name) return null;

  const castCredits = (d.combined_credits?.cast ?? []) as any[];
  // TMDB's combined_credits.cast can legitimately list the same title twice
  // (e.g. a recurring TV role tracked as separate credit_ids, or a title
  // that's both directed and acted in showing up once per department) —
  // dedupe by id+media_type BEFORE slicing to 20, so the cap doesn't burn
  // slots on repeats and callers never get two React children with the
  // same key (movie.id is what MovieCard keys off of).
  const seenCredit = new Set<string>();
  const credits = castCredits
    .filter((c: any) => c.media_type === "movie" || c.media_type === "tv")
    .sort((a: any, b: any) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .filter((c: any) => {
      const key = `${c.media_type}-${c.id}`;
      if (seenCredit.has(key)) return false;
      seenCredit.add(key);
      return true;
    })
    .slice(0, 20)
    .map((c: any) => fromSearchHit({ ...c, media_type: c.media_type }))
    .filter(Boolean) as Movie[];

  return {
    name: d.name,
    character: castCredits[0]?.character || "Cast",
    profilePath: d.profile_path || null,
    credits,
  };
}

/** Best available YouTube trailer key from a TMDB videos list. */
export function pickTrailer(vids: any[]): string | null {
  const v =
    vids.find((x) => x.site === "YouTube" && x.type === "Trailer" && x.official) ||
    vids.find((x) => x.site === "YouTube" && x.type === "Trailer") ||
    vids.find((x) => x.site === "YouTube" && x.type === "Teaser") ||
    vids.find((x) => x.site === "YouTube");
  return v?.key ?? null;
}

/** Trailer key for a title we may not have cached. */
export async function trailerFor(kind: MovieKind, id: string): Promise<string | null> {
  const d = await get<any>(`${kind === "series" ? "/tv" : "/movie"}/${id}/videos`);
  return d?.results ? pickTrailer(d.results) : null;
}

/* ---------------------------------------------------------------------
   Live catalogue data — pulled straight from TMDB at request time so rows
   and listing pages reflect real, current, GLOBAL content (a mix of
   Hollywood, Bollywood and everything else) rather than only the local
   catalogue. Pass a `region` (ISO 3166-1 country code, e.g. "US"/"IN") to
   bias a query to one industry — omit it for an unrestricted global mix.
   Callers should fall back to the local-catalogue rule (lib/data.ts →
   resolveRow) if a call returns [] (TMDB unreachable/unconfigured).
   ------------------------------------------------------------------- */

const GENRE_CACHE: Partial<Record<MovieKind, Record<number, string>>> = {};

async function genreMap(kind: MovieKind): Promise<Record<number, string>> {
  if (GENRE_CACHE[kind]) return GENRE_CACHE[kind]!;
  const d = await get<any>(`/genre/${kind === "series" ? "tv" : "movie"}/list`);
  const map: Record<number, string> = {};
  for (const g of d?.genres ?? []) map[g.id] = g.name;
  GENRE_CACHE[kind] = map;
  return map;
}

/** A few genre names differ between TMDB's movie and tv genre lists. */
const TV_GENRE_ALIAS: Record<string, string> = {
  Action: "Action & Adventure", Adventure: "Action & Adventure",
  "Sci-Fi": "Sci-Fi & Fantasy", Fantasy: "Sci-Fi & Fantasy", War: "War & Politics",
};

async function genreIdFor(kind: MovieKind, name?: string): Promise<number | undefined> {
  if (!name || name === "All") return undefined;
  const map = await genreMap(kind);
  const entries = Object.entries(map);
  const wanted = kind === "series" && TV_GENRE_ALIAS[name] ? TV_GENRE_ALIAS[name] : name;
  const hit = entries.find(([, n]) => n === wanted);
  return hit ? Number(hit[0]) : undefined;
}

function fromDiscoverHit(hit: any, kind: MovieKind, genres: Record<number, string>): Movie | null {
  const title = kind === "series" ? hit.name : hit.title;
  if (!title || !hit.poster_path) return null; // skip titles with no artwork — looks broken in a row
  const date = String((kind === "series" ? hit.first_air_date : hit.release_date) || "");
  return {
    id: tmdbId(kind, hit.id, title),
    tmdbId: hit.id,
    title,
    year: Number(date.slice(0, 4)) || 0,
    genres: (hit.genre_ids ?? []).map((g: number) => genres[g]).filter(Boolean).slice(0, 3),
    kind,
    rating: Number((hit.vote_average ?? 0).toFixed(1)),
    votes: hit.vote_count ?? 0,
    runtime: "—",
    cert: "NR",
    language: (hit.original_language || "").toUpperCase(),
    director: "—",
    writers: "—",
    cast: [],
    desc: hit.overview || "No synopsis available yet.",
    posterPath: hit.poster_path || null,
    backdropPath: hit.backdrop_path || null,
  };
}

/** Real TMDB "Trending" data — the actual /trending endpoint (a genuine
 *  day-over-day trending score TMDB computes), not an approximation via
 *  /discover?sort_by=popularity.desc. Those two are NOT the same ranking:
 *  discover's `popularity` field is a slower-moving, all-time-ish score, so
 *  a discover-sorted "trending" row drifted from what TMDB.com itself shows
 *  under "Trending" — this is the direct fix for that mismatch. Only
 *  unrestricted (no region) queries can use this — TMDB's /trending
 *  endpoint has no region/origin-country filter, so regionally-biased rows
 *  (Hollywood/Bollywood/Korean/Chinese "popular right now" style rows)
 *  still fall back to the discover approximation below. */
async function trendingPage(kind: MovieKind, timeWindow: "day" | "week", page: number): Promise<{ results: any[]; totalPages: number }> {
  const d = await get<any>(`/trending/${kind === "series" ? "tv" : "movie"}/${timeWindow}`, { page });
  return { results: d?.results ?? [], totalPages: Math.min(Number(d?.total_pages) || 1, MAX_PAGES) };
}
async function trendingAllPage(timeWindow: "day" | "week", page: number): Promise<{ results: any[]; totalPages: number }> {
  const d = await get<any>(`/trending/all/${timeWindow}`, { page });
  return { results: d?.results ?? [], totalPages: Math.min(Number(d?.total_pages) || 1, MAX_PAGES) };
}
function mapTrendingHits(hits: any[], movieGenres: Record<number, string>, tvGenres: Record<number, string>): Movie[] {
  return hits
    .map((h) => {
      const kind: MovieKind = h.media_type === "tv" ? "series" : "movie";
      return fromDiscoverHit(h, kind, kind === "series" ? tvGenres : movieGenres);
    })
    .filter(Boolean) as Movie[];
}

async function discoverLive(kind: MovieKind, sortBy: string, limit: number, minVotes: number, region?: string): Promise<Movie[]> {
  const isTv = kind === "series";
  const today = new Date().toISOString().slice(0, 10);
  const params: Record<string, string | number> = {
    sort_by: sortBy,
    include_adult: "false",
    "vote_count.gte": minVotes,
    page: 1,
  };
  if (region) params.with_origin_country = region;
  params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
  const [d, genres] = await Promise.all([
    get<any>(isTv ? "/discover/tv" : "/discover/movie", params),
    genreMap(kind),
  ]);
  return ((d?.results ?? []) as any[])
    .map((hit) => fromDiscoverHit(hit, kind, genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

const kindsFor = (kind: MovieKind | "all"): MovieKind[] => (kind === "all" ? ["movie", "series"] : [kind]);

/** "Latest" row — newest real releases first, straight from TMDB (global mix unless `region` is set). */
export async function latestReleasesTmdb(kind: MovieKind | "all" = "movie", limit = 6, region?: string): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const lists = await Promise.all(
    kindsFor(kind).map((k) => discoverLive(k, k === "series" ? "first_air_date.desc" : "primary_release_date.desc", limit, 1, region))
  );
  return lists.flat().sort((a, b) => b.year - a.year || (b.votes ?? 0) - (a.votes ?? 0)).slice(0, limit);
}

/** "Trending" row — matches TMDB.com's own Trending list exactly when no
 *  region bias is requested (see trendingPage/trendingAllPage above). A
 *  region-biased call (Hollywood/Bollywood/etc.) has no TMDB-native
 *  equivalent, so it still approximates via discover + popularity sort. */
export async function trendingLiveTmdb(kind: MovieKind | "all" = "all", limit = 6, region?: string): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  if (!region) {
    const [mg, tg] = await Promise.all([genreMap("movie"), genreMap("series")]);
    if (kind === "all") {
      const { results } = await trendingAllPage("day", 1);
      return mapTrendingHits(results, mg, tg).slice(0, limit);
    }
    const { results } = await trendingPage(kind, "day", 1);
    return mapTrendingHits(results, mg, tg).slice(0, limit);
  }
  const lists = await Promise.all(kindsFor(kind).map((k) => discoverLive(k, "popularity.desc", limit, 5, region)));
  return lists.flat().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, limit);
}

/** "Top Rated" row — highest rated right now, straight from TMDB (global mix unless `region` is set). */
export async function topRatedTmdb(kind: MovieKind | "all" = "all", limit = 6, region?: string): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const lists = await Promise.all(kindsFor(kind).map((k) => discoverLive(k, "vote_average.desc", limit, region ? 50 : 200, region)));
  return lists.flat().sort((a, b) => b.rating - a.rating).slice(0, limit);
}

/** Convenience category rows for the homepage. */
export const hollywoodTmdb = (kind: MovieKind | "all" = "all", limit = 6) => trendingLiveTmdb(kind, limit, "US");
export const bollywoodTmdb = (kind: MovieKind | "all" = "all", limit = 6) => trendingLiveTmdb(kind, limit, "IN");
/** South Korean movies/dramas — "K-Drama" is this site's own umbrella term
 *  for TV originating in Korea, not a distinct TMDB category, so it's just
 *  origin_country=KR biased popularity, same technique as Hollywood/Bollywood. */
export const koreanTmdb = (kind: MovieKind | "all" = "all", limit = 6) => trendingLiveTmdb(kind, limit, "KR");
/** Chinese-language film & TV — mainland China, Hong Kong and Taiwan
 *  together ("C-Drama" covers all three in common usage), via TMDB's
 *  pipe-separated OR syntax for `with_origin_country`. */
export const chineseTmdb = (kind: MovieKind | "all" = "all", limit = 6) => trendingLiveTmdb(kind, limit, "CN|HK|TW");

/** Telugu cinema (Tollywood) — a distinct section from the broader
 *  "Bollywood" row above: that one is origin_country=IN, which already
 *  covers every Indian language including Telugu, so a separate Telugu row
 *  needs to filter by original language instead, not country, to actually
 *  be a different list. */
export const teluguTmdb = (kind: MovieKind | "all" = "all", limit = 6) => languageTmdb("te", kind, limit);

async function languageTmdb(lang: string, kind: MovieKind | "all", limit: number): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const today = new Date().toISOString().slice(0, 10);
  const lists = await Promise.all(
    kindsFor(kind).map(async (k) => {
      const isTv = k === "series";
      const genres = await genreMap(k);
      const params: Record<string, string | number> = {
        sort_by: "popularity.desc",
        include_adult: "false",
        with_original_language: lang,
        "vote_count.gte": 5,
        page: 1,
      };
      params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
      const d = await get<any>(isTv ? "/discover/tv" : "/discover/movie", params);
      return ((d?.results ?? []) as any[]).map((hit) => fromDiscoverHit(hit, k, genres)).filter(Boolean) as Movie[];
    })
  );
  return lists.flat().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, limit);
}

/** Anime — unlike the other regional rows, "anime" isn't just "from Japan":
 *  it's specifically Japanese-origin Animation (genre id 16). Discover
 *  supports combining a genre id with origin_country directly, so this
 *  covers both movies (Ghibli-style features) and TV (ongoing series) in
 *  one call each, merged and re-sorted by popularity. */
export async function animeTmdb(kind: MovieKind | "all" = "all", limit = 6): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const today = new Date().toISOString().slice(0, 10);
  const lists = await Promise.all(
    kindsFor(kind).map(async (k) => {
      const isTv = k === "series";
      const genres = await genreMap(k);
      const animationId = Object.entries(genres).find(([, name]) => name === "Animation")?.[0];
      const params: Record<string, string | number> = {
        sort_by: "popularity.desc",
        include_adult: "false",
        with_origin_country: "JP",
        "vote_count.gte": 5,
        page: 1,
      };
      if (animationId) params.with_genres = animationId;
      params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
      const d = await get<any>(isTv ? "/discover/tv" : "/discover/movie", params);
      return ((d?.results ?? []) as any[]).map((hit) => fromDiscoverHit(hit, k, genres)).filter(Boolean) as Movie[];
    })
  );
  return lists.flat().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, limit);
}

/* ---------------------------------------------------------------------
   Official TMDB list endpoints — /movie/now_playing, /movie/upcoming,
   /movie/popular, /movie/top_rated, /tv/popular, /tv/top_rated and
   /tv/on_the_air are TMDB's own curated/computed lists, distinct from the
   discover approximations above (e.g. topRatedTmdb sorts *current*
   discover results by rating; /movie/top_rated is TMDB's real all-time
   chart). The homepage's new sections use these so "Top Rated Movies of
   All Time" / "Now Showing" / "Upcoming" mean exactly what they say.
   ------------------------------------------------------------------- */

async function officialList(kind: MovieKind, path: string, limit: number, params: Record<string, string | number> = {}): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const [d, genres] = await Promise.all([get<any>(path, { page: 1, ...params }), genreMap(kind)]);
  return ((d?.results ?? []) as any[])
    .map((hit) => fromDiscoverHit(hit, kind, genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

/** "Now Showing" — movies actually in theatres right now (TMDB /movie/now_playing). */
export const nowPlayingTmdb = (limit = 6) => officialList("movie", "/movie/now_playing", limit);

/** "Upcoming" — TMDB's /movie/upcoming window includes films released in the
 *  last few days, so filter to strictly-future release dates: an "Upcoming"
 *  row showing already-released titles reads as broken. Two pages fetched
 *  because filtering can thin page 1 below the requested limit. */
/** "Most Anticipated" — the biggest films still ahead of us.
 *
 *  Deliberately NOT TMDB's /movie/upcoming, which only covers the next few
 *  weeks of theatrical scheduling and so misses the titles people are
 *  actually excited about months out (Avengers: Doomsday, for one). This
 *  asks discover for everything releasing from today onward, ranked by
 *  TMDB popularity, which surfaces the genuinely anticipated blockbusters
 *  and keeps doing so automatically as the calendar moves - no hardcoded
 *  title list to go stale. One API call plus the shared genre map. */
export async function anticipatedTmdb(limit = 6): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [d, genres] = await Promise.all([
    get<any>("/discover/movie", {
      "primary_release_date.gte": today,
      sort_by: "popularity.desc",
      include_adult: "false",
      with_release_type: "2|3",
      page: 1,
    }),
    genreMap("movie"),
  ]);
  const seen = new Set<number>();
  return ((d?.results ?? []) as any[])
    .filter((h) => h.poster_path && String(h.release_date || "") > today)
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .map((h) => fromDiscoverHit(h, "movie", genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

export async function upcomingTmdb(limit = 6): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const today = new Date().toISOString().slice(0, 10);
  const [p1, p2, genres] = await Promise.all([
    get<any>("/movie/upcoming", { page: 1 }),
    get<any>("/movie/upcoming", { page: 2 }),
    genreMap("movie"),
  ]);
  const hits = [...(p1?.results ?? []), ...(p2?.results ?? [])] as any[];
  const seen = new Set<number>();
  return hits
    .filter((h) => String(h.release_date || "") > today)
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)))
    .map((h) => fromDiscoverHit(h, "movie", genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

/** "Popular Movies" / "Popular TV Shows" — TMDB's own popularity chart. */
export const popularListTmdb = (kind: MovieKind, limit = 6) =>
  officialList(kind, kind === "series" ? "/tv/popular" : "/movie/popular", limit);

/** "Top Rated ... of All Time" — TMDB's real all-time top-rated chart. */
export const topRatedListTmdb = (kind: MovieKind, limit = 6) =>
  officialList(kind, kind === "series" ? "/tv/top_rated" : "/movie/top_rated", limit);

/** "On The Air" — shows with an episode airing in the next 7 days. */
export const onTheAirTmdb = (limit = 6) => officialList("series", "/tv/on_the_air", limit);

/** Genre rows (Thriller / Action / Animation / Kids / Crime / Western...) —
 *  discover filtered to one genre, most-popular-first, released-only.
 *  Genre is passed by NAME (resolved against TMDB's own per-kind genre
 *  list, with the movie→tv alias table applied), so callers read cleanly:
 *  genreRowTmdb("movie", "Thriller"), genreRowTmdb("series", "Kids"). */
/** Audience-language rows: the most popular titles in a given ORIGINAL
 *  language (Bollywood hi, Telugu te, Tamil ta, Korean ko, Japanese ja),
 *  optionally pinned to an origin country (IN serials, PK dramas). This is
 *  what lets the homepage speak the audience's own languages instead of a
 *  generic global feed. Lower vote floor than genre rows: regional titles
 *  accumulate fewer TMDB votes than Hollywood at the same popularity. */
export async function languageRowTmdb(
  kind: MovieKind, lang: string, limit = 10, originCountry?: string, genreName?: string
): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const isTv = kind === "series";
  const genres = await genreMap(kind);
  const params: Record<string, string | number> = {
    sort_by: "popularity.desc",
    include_adult: "false",
    with_original_language: lang,
    "vote_count.gte": 5,
  };
  if (originCountry) params.with_origin_country = originCountry;
  if (genreName) {
    const gid = await genreIdFor(kind, genreName);
    if (gid) params.with_genres = gid;
  }
  const d = await get<any>(`/discover/${isTv ? "tv" : "movie"}`, params);
  return (d?.results ?? [])
    .map((r: any) => fromDiscoverHit(r, kind, genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

export async function genreRowTmdb(kind: MovieKind, genre: string, limit = 6): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const isTv = kind === "series";
  const today = new Date().toISOString().slice(0, 10);
  const [gid, genres] = await Promise.all([genreIdFor(kind, genre), genreMap(kind)]);
  if (!gid) return [];
  const params: Record<string, string | number> = {
    sort_by: "popularity.desc",
    include_adult: "false",
    with_genres: gid,
    "vote_count.gte": 20,
    page: 1,
  };
  params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
  const d = await get<any>(isTv ? "/discover/tv" : "/discover/movie", params);
  return ((d?.results ?? []) as any[])
    .map((hit) => fromDiscoverHit(hit, kind, genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

/** Per-title watch providers (region-scoped) — TMDB's watch/providers
 *  endpoint, whose data comes from JustWatch (attribution required in the
 *  UI). Merged across flatrate/free/ads (→ "stream") and rent/buy, deduped
 *  with streaming access winning, so a title both streamable and rentable
 *  on the same platform shows as streamable. */
export interface WatchProvider { providerId: number; name: string; access: "stream" | "rent" | "buy"; logoPath?: string }
export async function watchProvidersTmdb(kind: MovieKind, id: string | number, region = "IN"): Promise<WatchProvider[]> {
  const d = await get<any>(`${kind === "series" ? "/tv" : "/movie"}/${id}/watch/providers`);
  const r = d?.results?.[region];
  if (!r) return [];
  const seen = new Map<number, WatchProvider>();
  const addAll = (list: any[] | undefined, access: WatchProvider["access"]) => {
    for (const p of list ?? []) {
      if (p?.provider_id && !seen.has(p.provider_id)) {
        seen.set(p.provider_id, { providerId: p.provider_id, name: p.provider_name ?? "Unknown", access, logoPath: p.logo_path ?? undefined });
      }
    }
  };
  addAll(r.flatrate, "stream");
  addAll(r.free, "stream");
  addAll(r.ads, "stream");
  addAll(r.rent, "rent");
  addAll(r.buy, "buy");
  return [...seen.values()];
}

/** Live candidate pool for the Mood Roulette — popular, well-rated,
 *  CURRENT titles matching a mood's genre recipe, straight from TMDB
 *  (movies + shows merged), instead of only whatever happens to be in the
 *  local catalogue. Genre names are resolved per-kind (movie/tv genre ids
 *  differ); includes are OR'd (TMDB pipe syntax), excludes hard-filter via
 *  without_genres. The vote floor keeps picks credible — a roulette that
 *  lands on a 12-vote obscurity feels broken, not serendipitous. */
export async function moodPoolTmdb(genres: string[], excludes: string[], limit = 20): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const today = new Date().toISOString().slice(0, 10);
  const lists = await Promise.all(
    (["movie", "series"] as MovieKind[]).map(async (k) => {
      const isTv = k === "series";
      const [genreIds, excludeIds, map] = await Promise.all([
        Promise.all(genres.map((g) => genreIdFor(k, g))),
        Promise.all(excludes.map((g) => genreIdFor(k, g))),
        genreMap(k),
      ]);
      const withGenres = genreIds.filter(Boolean).join("|");
      if (!withGenres) return [] as Movie[];
      const params: Record<string, string | number> = {
        sort_by: "popularity.desc",
        include_adult: "false",
        with_genres: withGenres,
        "vote_count.gte": 100,
        "vote_average.gte": 6,
        page: 1,
      };
      const withoutGenres = excludeIds.filter(Boolean).join("|");
      if (withoutGenres) params.without_genres = withoutGenres;
      params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
      const d = await get<any>(isTv ? "/discover/tv" : "/discover/movie", params);
      return ((d?.results ?? []) as any[]).map((hit) => fromDiscoverHit(hit, k, map)).filter(Boolean) as Movie[];
    })
  );
  return lists.flat().sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).slice(0, limit);
}

/** Titles currently streaming on one platform (Netflix, Prime Video,
 *  JioHotstar, ZEE5...) — discover filtered by TMDB's watch-provider data
 *  (sourced from JustWatch). watch_region defaults to IN since that's
 *  where this site's audience (and JioHotstar/ZEE5/SonyLIV themselves)
 *  are; availability genuinely differs per country, so a region is
 *  required by the API for the filter to apply at all. */
export async function providerTitlesTmdb(providerId: number, kind: MovieKind, limit = 18, page = 1, region = "IN"): Promise<Movie[]> {
  if (!tmdbConfigured) return [];
  const isTv = kind === "series";
  const [d, genres] = await Promise.all([
    get<any>(isTv ? "/discover/tv" : "/discover/movie", {
      sort_by: "popularity.desc",
      include_adult: "false",
      with_watch_providers: providerId,
      watch_region: region,
      page: Math.max(1, page),
    }),
    genreMap(kind),
  ]);
  return ((d?.results ?? []) as any[])
    .map((hit) => fromDiscoverHit(hit, kind, genres))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}

/* ---------------------------------------------------------------------
   Seasons & episodes — powers the season/episode picker on a series'
   detail page. Episode-level trailers are sparse on TMDB, so the trailer
   lookup falls back episode → season → show before giving up.
   ------------------------------------------------------------------- */

export interface SeasonInfo { season: number; name: string; episodeCount: number; year: number | null }
export interface EpisodeInfo { episode: number; name: string; overview: string; stillPath: string | null; airDate: string; runtime: number | null }

/** Real seasons for a show (specials/"Season 0" excluded — they're mostly
 *  behind-the-scenes reels and would confuse the picker). */
export async function fetchSeasons(id: string | number): Promise<SeasonInfo[]> {
  const d = await get<any>(`/tv/${id}`);
  return ((d?.seasons ?? []) as any[])
    .filter((s) => (s.season_number ?? 0) > 0 && (s.episode_count ?? 0) > 0)
    .map((s) => ({
      season: s.season_number,
      name: s.name || `Season ${s.season_number}`,
      episodeCount: s.episode_count ?? 0,
      year: s.air_date ? Number(String(s.air_date).slice(0, 4)) || null : null,
    }));
}

export async function fetchSeasonEpisodes(id: string | number, season: number): Promise<EpisodeInfo[]> {
  const d = await get<any>(`/tv/${id}/season/${season}`);
  return ((d?.episodes ?? []) as any[]).map((e) => ({
    episode: e.episode_number,
    name: e.name || `Episode ${e.episode_number}`,
    overview: e.overview || "",
    stillPath: e.still_path || null,
    airDate: String(e.air_date || ""),
    runtime: e.runtime ?? null,
  }));
}

/** Best available video for one episode: the episode's own trailer/teaser
 *  first, then the season's, then the show's main trailer. */
export async function episodeTrailerTmdb(id: string | number, season: number, episode: number): Promise<string | null> {
  const ep = await get<any>(`/tv/${id}/season/${season}/episode/${episode}/videos`);
  const epKey = ep?.results ? pickTrailer(ep.results) : null;
  if (epKey) return epKey;
  const se = await get<any>(`/tv/${id}/season/${season}/videos`);
  const seKey = se?.results ? pickTrailer(se.results) : null;
  if (seKey) return seKey;
  return trailerFor("series", String(id));
}

/* ---------------------------------------------------------------------
   Paginated live browse — powers the Movies / TV Shows / Web Series /
   Trending / Latest listing pages: latest-first (or by whatever sort is
   picked), a real global mix, with genuine TMDB pagination underneath.
   ------------------------------------------------------------------- */

export type BrowseSort = "trending" | "rating" | "year" | "az";
export interface BrowseParams { kind: MovieKind | "all"; sort: BrowseSort; genre?: string; page?: number }
export interface BrowseResult { results: Movie[]; page: number; totalPages: number }

const SORT_MAP: Record<BrowseSort, { movie: string; tv: string }> = {
  trending: { movie: "popularity.desc", tv: "popularity.desc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
  year: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
  az: { movie: "original_title.asc", tv: "name.asc" },
};
const MIN_VOTES: Record<BrowseSort, number> = { trending: 20, rating: 200, year: 1, az: 0 };
/** Maximum PUBLIC browse depth, in pages, for every listing route.
 *
 *  Was 50. Each (kind, sort, genre, page) combination is its own TMDB request
 *  and therefore its own persisted cache entry, so 50 pages multiplied the
 *  cache surface tenfold for pages almost nobody reaches - while giving
 *  crawlers an enormous, effectively pointless corridor to walk.
 *
 *  At 15 titles per page this still exposes ~75 titles per listing, per
 *  genre, per sort. The FULL catalogue stays reachable: search hits TMDB
 *  directly, and every title page works by direct URL whether or not it
 *  appears in a browse page. Small browse surface, large searchable
 *  catalogue. */
export const MAX_BROWSE_PAGE = 5;
const MAX_PAGES = MAX_BROWSE_PAGE;

async function discoverPage(kind: MovieKind, sort: BrowseSort, genre: string | undefined, page: number): Promise<{ results: Movie[]; totalPages: number }> {
  // Same fix as trendingLiveTmdb above: the real /trending endpoint, not a
  // popularity-sorted /discover approximation — this is what the "Trending"
  // listing page ultimately renders, so it's the other place the "doesn't
  // match TMDB.com" complaint traces back to. Only when there's no genre
  // filter active — /trending has no genre parameter, so a genre-filtered
  // trending view still falls through to the discover approximation below.
  if (sort === "trending" && !genre) {
    const [{ results, totalPages }, genres] = await Promise.all([trendingPage(kind, "day", Math.max(1, page)), genreMap(kind)]);
    return { results: mapTrendingHits(results, genres, genres), totalPages };
  }
  const isTv = kind === "series";
  const today = new Date().toISOString().slice(0, 10);
  const [gid, genres] = await Promise.all([genreIdFor(kind, genre), genreMap(kind)]);
  const params: Record<string, string | number> = {
    sort_by: SORT_MAP[sort][isTv ? "tv" : "movie"],
    include_adult: "false",
    page: Math.max(1, page),
    "vote_count.gte": MIN_VOTES[sort],
  };
  if (sort === "year") params[isTv ? "first_air_date.lte" : "primary_release_date.lte"] = today;
  if (gid) params.with_genres = gid;
  const d = await get<any>(isTv ? "/discover/tv" : "/discover/movie", params);
  const results = ((d?.results ?? []) as any[]).map((hit) => fromDiscoverHit(hit, kind, genres)).filter(Boolean) as Movie[];
  const totalPages = Math.min(Number(d?.total_pages) || 1, MAX_PAGES);
  return { results, totalPages };
}

/** Paginated live browse. Returns null (not []) when TMDB isn't reachable/configured, so
 *  the caller can tell "no results" apart from "fall back to the local catalogue". */
export async function browsePage({ kind, sort, genre, page = 1 }: BrowseParams): Promise<BrowseResult | null> {
  if (!tmdbConfigured) return null;
  if (kind !== "all") {
    const { results, totalPages } = await discoverPage(kind, sort, genre, page);
    return { results, page, totalPages };
  }
  // "all" — merge a movie page and a tv page for the same page number.
  const [m, t] = await Promise.all([discoverPage("movie", sort, genre, page), discoverPage("series", sort, genre, page)]);
  const merged = [...m.results, ...t.results];
  if (sort === "rating") merged.sort((a, b) => b.rating - a.rating);
  else if (sort === "year") merged.sort((a, b) => b.year - a.year);
  else if (sort === "az") merged.sort((a, b) => a.title.localeCompare(b.title));
  else merged.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  // Cap at the same page size every other path uses (single-kind branches
  // above return one TMDB page — typically 20 — and lib/browse.ts's local
  // fallback uses PAGE_SIZE = 20). Without this, merging a movie page + a
  // tv page here silently doubled "all" pages to up to 40 results, so
  // pagination behaved differently depending on which filter was active.
  const BROWSE_PAGE_SIZE = 15;
  return { results: merged.slice(0, BROWSE_PAGE_SIZE), page, totalPages: Math.min(m.totalPages, t.totalPages) };
}

/** Similar/recommended titles, for the detail page rails. */
export async function relatedTmdb(kind: MovieKind, id: string, limit = 8): Promise<Movie[]> {
  const d = await get<any>(`${kind === "series" ? "/tv" : "/movie"}/${id}/recommendations`);
  if (!d?.results) return [];
  return d.results
    .map((r: any) => fromSearchHit({ ...r, media_type: kind === "series" ? "tv" : "movie" }))
    .filter(Boolean)
    .slice(0, limit) as Movie[];
}
