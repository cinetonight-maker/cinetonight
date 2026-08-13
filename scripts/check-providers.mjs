// Verifies every channel's TMDB watch-provider id actually returns titles,
// and prints TMDB's REAL provider list for India so wrong ids can be
// corrected with certainty instead of guesswork.
//
//   node scripts/check-providers.mjs
//
// Reads TMDB_API_KEY (or TMDB_READ_TOKEN) from .env.local.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* env may already be set */ }
}
loadEnvLocal();

const KEY = process.env.TMDB_API_KEY?.trim();
const TOKEN = process.env.TMDB_READ_TOKEN?.trim();
if (!KEY && !TOKEN) { console.error("Missing TMDB_API_KEY / TMDB_READ_TOKEN in .env.local"); process.exit(1); }

async function tmdb(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  if (KEY) url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// Mirror of lib/channels.ts — keep in sync when channels change.
const CHANNELS = [
  ["netflix", 8, "IN"], ["prime-video", 119, "IN"], ["jiohotstar", 2336, "IN"],
  ["apple-tv", 350, "IN"], ["zee5", 232, "IN"], ["sony-liv", 237, "IN"],
  ["crunchyroll", 283, "IN"], ["viki", 344, "US"], ["sun-nxt", 309, "IN"],
  ["hoichoi", 315, "IN"], ["shemaroo-me", 474, "IN"], ["lionsgate-play", 561, "IN"],
  ["youtube", 192, "IN"], ["mx-player", 515, "IN"], ["aha", 532, "IN"],
];

console.log("— Testing configured channels (movie count via discover) —");
for (const [slug, id, region] of CHANNELS) {
  try {
    const d = await tmdb("/discover/movie", { with_watch_providers: id, watch_region: region, sort_by: "popularity.desc" });
    const n = d.total_results ?? 0;
    console.log(`${n > 0 ? "✓" : "✗"} ${slug.padEnd(14)} id=${String(id).padEnd(4)} region=${region}  → ${n} movies`);
  } catch (e) {
    console.log(`✗ ${slug.padEnd(14)} id=${String(id).padEnd(4)} region=${region}  → ERROR ${e.message}`);
  }
}

console.log("\n— TMDB's actual provider list for India (name → id), filtered to likely matches —");
const WANT = /netflix|prime|hotstar|jio|apple|zee|sony|crunchy|viki|sun|hoichoi|eros|google|youtube|mx|aha|lionsgate|discovery|shemaroo|manorama|simply|chaupal|stage|ullu|alt/i;
const provs = await tmdb("/watch/providers/movie", { watch_region: "IN" });
for (const p of (provs.results ?? []).filter((p) => WANT.test(p.provider_name)).sort((a, b) => a.provider_name.localeCompare(b.provider_name))) {
  console.log(`  ${String(p.provider_id).padStart(5)}  ${p.provider_name}`);
}
console.log("\nFix any ✗ by matching the right id from the list above in lib/channels.ts (and this script).");
