#!/usr/bin/env node
/**
 * CineTonight — TMDB sync.
 *
 *   1. Get a free API key:  https://www.themoviedb.org/settings/api
 *   2. Put it in .env.local:  TMDB_API_KEY=your_key_here
 *   3. Run:  npm run sync
 *
 * Looks up every title in lib/catalogue.mjs, pulls details + credits, and
 * regenerates content/movies.json with real posters, backdrops, ratings, runtimes,
 * genres, overviews and cast (with photos).
 *
 * This product uses the TMDB API but is not endorsed or certified by TMDB.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOGUE, ROW_SEED, CONTINUE_SEED, slugify } from "../lib/catalogue.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.themoviedb.org/3";

// ---- credentials: v3 API key OR v4 read access token ----------------------
function envValue(name) {
  if (process.env[name]) return process.env[name].trim();
  const envFile = resolve(ROOT, ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
const KEY = envValue("TMDB_API_KEY");            // v3 key  -> ?api_key=
const TOKEN = envValue("TMDB_READ_TOKEN");       // v4 token -> Authorization: Bearer
if (!KEY && !TOKEN) {
  console.error(`
✗ No TMDB API key found.

  1. Get credentials at https://www.themoviedb.org/settings/api
  2. Save ONE of these in ${resolve(ROOT, ".env.local")}:
       TMDB_API_KEY=your_v3_api_key
       TMDB_READ_TOKEN=your_v4_read_access_token
  3. Re-run:  npm run sync
`);
  process.exit(1);
}

// ---- tiny fetch helper with retry + gentle rate limiting -------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, params = {}) {
  const url = new URL(API + path);
  if (KEY) url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const init = TOKEN ? { headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" } } : undefined;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429) { await sleep(1200 * attempt); continue; }
    if (res.status === 401) throw new Error("TMDB rejected the credentials (401). Check TMDB_API_KEY / TMDB_READ_TOKEN.");
    if (res.status === 403) {
      const body = (await res.text()).slice(0, 120);
      throw new Error(body.includes("allowlist")
        ? `network blocked api.themoviedb.org (${body})`
        : `TMDB 403 — ${body}`);
    }
    if (!res.ok) {
      if (attempt === 4) throw new Error(`TMDB ${res.status} for ${path}`);
      await sleep(500 * attempt); continue;
    }
    return res.json();
  }
}

// ---- certification helpers -------------------------------------------------
function movieCert(details) {
  const list = details.release_dates?.results ?? [];
  for (const code of ["IN", "US", "GB"]) {
    const hit = list.find((r) => r.iso_3166_1 === code);
    const cert = hit?.release_dates?.map((d) => d.certification).find((c) => c);
    if (cert) return cert;
  }
  return "NR";
}
function tvCert(details) {
  const list = details.content_ratings?.results ?? [];
  for (const code of ["IN", "US", "GB"]) {
    const hit = list.find((r) => r.iso_3166_1 === code);
    if (hit?.rating) return hit.rating;
  }
  return "NR";
}
function runtimeOf(kind, d) {
  if (kind === "series") {
    const n = d.number_of_seasons ?? 1;
    return `${n} Season${n === 1 ? "" : "s"}`;
  }
  const mins = d.runtime ?? 0;
  return mins ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m` : "—";
}

// ---- per-title lookup ------------------------------------------------------
async function lookup(entry) {
  const isTv = entry.kind === "series";
  let id = entry.tmdbId;

  if (!id) {
    const search = await get(isTv ? "/search/tv" : "/search/movie", {
      query: entry.title,
      ...(isTv ? { first_air_date_year: entry.year } : { year: entry.year }),
      include_adult: "false",
    });
    let hit = search.results?.[0];
    if (!hit) {
      // retry without the year filter — release years sometimes differ by region
      const loose = await get(isTv ? "/search/tv" : "/search/movie", { query: entry.title, include_adult: "false" });
      hit = loose.results?.[0];
    }
    if (!hit) { console.warn(`  ! no TMDB match for "${entry.title}" — skipped`); return null; }
    id = hit.id;
  }

  const d = await get(isTv ? `/tv/${id}` : `/movie/${id}`, {
    append_to_response: isTv ? "credits,content_ratings,videos" : "credits,release_dates,videos",
  });

  const crew = d.credits?.crew ?? [];
  const director = isTv
    ? (d.created_by?.map((c) => c.name).join(", ") || crew.find((c) => c.job === "Director")?.name || "—")
    : (crew.filter((c) => c.job === "Director").map((c) => c.name).join(", ") || "—");
  const writers = crew
    .filter((c) => ["Writer", "Screenplay", "Story"].includes(c.job))
    .map((c) => c.name);
  const vids = d.videos?.results ?? [];
  const trailer =
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ||
    vids.find((v) => v.site === "YouTube" && v.type === "Trailer") ||
    vids.find((v) => v.site === "YouTube" && v.type === "Teaser") ||
    vids.find((v) => v.site === "YouTube");
  const cast = (d.credits?.cast ?? []).slice(0, 10).map((c) => ({
    name: c.name,
    character: c.character || "Cast",
    profilePath: c.profile_path || null,
    tmdbId: c.id,
  }));

  return {
    id: slugify(entry.title),
    tmdbId: id,
    title: (isTv ? d.name : d.title) || entry.title,
    year: Number(String(isTv ? d.first_air_date : d.release_date).slice(0, 4)) || entry.year,
    genres: (d.genres ?? []).map((g) => g.name).slice(0, 3),
    kind: entry.kind,
    rating: Number((d.vote_average ?? 0).toFixed(1)),
    votes: d.vote_count ?? 0,
    runtime: runtimeOf(entry.kind, d),
    cert: isTv ? tvCert(d) : movieCert(d),
    language: (d.spoken_languages?.[0]?.english_name) || (d.original_language || "").toUpperCase() || "—",
    director,
    writers: [...new Set(writers)].slice(0, 3).join(", ") || director,
    cast,
    desc: d.overview || "No synopsis available yet.",
    posterPath: d.poster_path || null,
    backdropPath: d.backdrop_path || null,
    trailerKey: trailer?.key || null,
  };
}

// ---- output ---------------------------------------------------------------
// ---- run -------------------------------------------------------------------
console.log(`Syncing ${CATALOGUE.length} titles from TMDB…\n`);
const out = [];
for (const entry of CATALOGUE) {
  try {
    const m = await lookup(entry);
    if (m) {
      out.push(m);
      console.log(`  ✓ ${m.title} (${m.year})  ★${m.rating}  ${m.posterPath ? "poster ✓" : "poster ✗"}  ${m.trailerKey ? "trailer ✓" : "trailer ✗"}  ${m.cast.length} cast`);
    }
  } catch (err) {
    console.warn(`  ! ${entry.title}: ${err.message}`);
  }
  await sleep(120); // stay well inside TMDB rate limits
}

if (!out.length) {
  console.error("\n✗ Nothing synced — content/movies.json left unchanged.");
  process.exit(1);
}
writeFileSync(resolve(ROOT, "content/movies.json"), JSON.stringify(out, null, 2), "utf8");
console.log(`\n✓ Wrote content/movies.json — ${out.length} titles, ${new Set(out.flatMap((m) => m.cast.map((c) => c.name))).size} people.`);
console.log("  Rows, hero slides and blog posts live in content/site.json (edit them at /admin).");
console.log("  Restart `npm run dev` to see it.\n");
