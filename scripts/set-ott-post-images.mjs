#!/usr/bin/env node
/**
 * Set real TMDB backdrops as the feature images of the OTT release posts.
 * Run from the project root:  node scripts/set-ott-post-images.mjs
 *
 * Uses the same TMDB API (and attribution) the whole site already runs on,
 * so the imagery is licensed the same way as every poster on the site.
 * Safe to re-run; it simply updates image_url on the matching posts.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const tmdbKey = process.env.TMDB_API_KEY;
if (!url || !key || !tmdbKey) { console.error('Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and TMDB_API_KEY in .env.local'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// slug -> TMDB search query (+ year hint where it helps accuracy)
const MAP = [
  { slug: 'cocktail-2-ott-release-date', query: 'Cocktail 2', year: 2026 },
  { slug: 'jana-nayagan-ott-release-date', query: 'Jana Nayagan', year: 2026 },
  { slug: 'michael-ott-release-date-jiohotstar', query: 'Michael', year: 2026 },
];

for (const { slug, query, year } of MAP) {
  const q = new URLSearchParams({ api_key: tmdbKey, query, ...(year ? { year: String(year) } : {}) });
  const res = await fetch(`https://api.themoviedb.org/3/search/movie?${q}`);
  const data = await res.json();
  const hit = (data.results ?? []).find((r) => r.backdrop_path) ?? (data.results ?? [])[0];
  if (!hit) { console.log('no TMDB match:', query); continue; }
  const img = hit.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`
    : hit.poster_path ? `https://image.tmdb.org/t/p/w780${hit.poster_path}` : null;
  if (!img) { console.log('no art available yet:', query, '(TMDB has no backdrop for it, keep the AI image for now)'); continue; }
  const { error } = await sb.from('blog_posts').update({ image_url: img }).eq('slug', slug);
  console.log(error ? `FAIL ${slug}: ${error.message}` : `set image for ${slug}: ${hit.title} (${(hit.release_date || '').slice(0, 4)})`);
}
console.log('Done. Check each post in Dashboard -> Blog and verify the image matches the right film before publishing.');
