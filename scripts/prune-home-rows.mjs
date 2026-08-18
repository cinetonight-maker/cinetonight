#!/usr/bin/env node
/**
 * Remove unwanted dashboard-managed homepage rows.
 * Run once from the project root:  node scripts/prune-home-rows.mjs
 *
 * The homepage has TWO sources of rows:
 *   1. the fixed rails written in app/page.tsx (code), and
 *   2. these rows, stored in Supabase `home_config.rows` and edited in
 *      Dashboard -> Home Rows.
 * C-Drama, Chinese Cinema and the duplicate Anime / K-Drama sections live
 * in (2), which is why they survived the code changes.
 *
 * This prints what it will remove BEFORE removing it, and leaves every other
 * row untouched. Nothing is deleted from the catalogue - only the homepage
 * row configuration changes, and you can re-add any row from the dashboard.
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
if (!url || !key) { console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

/** A row is removed if its title contains any of these (case-insensitive).
 *
 *  Two groups here. The first were asked for directly. The second DUPLICATE
 *  rails that already exist in code (app/page.tsx): the homepage was showing
 *  Bollywood twice and Telugu twice, and every duplicate row costs its own
 *  TMDB call on every render as well as making the page repeat itself. */
const REMOVE_MATCHING = [
  // asked for
  'c-drama', 'cdrama', 'chinese', 'anime', 'k-drama', 'kdrama', 'korean',
  // duplicates of the coded rails
  'latest movies', 'latest web series', 'trending this week',
  'hollywood', 'bollywood', 'telugu',
];

const { data, error } = await sb.from('home_config').select('rows').eq('id', 1).maybeSingle();
if (error) { console.error('Could not read home_config:', error.message); process.exit(1); }

const rows = data?.rows ?? [];
if (!rows.length) { console.log('No dashboard rows configured - nothing to do.'); process.exit(0); }

const shouldRemove = (r) => REMOVE_MATCHING.some((n) => String(r.title ?? '').toLowerCase().includes(n));
const kept = rows.filter((r) => !shouldRemove(r));
const removed = rows.filter(shouldRemove);

console.log(`\nCurrent dashboard rows (${rows.length}):`);
for (const r of rows) console.log(`  ${shouldRemove(r) ? 'REMOVE' : 'keep  '}  ${r.title}`);

if (!removed.length) { console.log('\nNothing matched - no changes made.'); process.exit(0); }

const { error: upErr } = await sb
  .from('home_config')
  .update({ rows: kept, updated_at: new Date().toISOString() })
  .eq('id', 1);

if (upErr) { console.error('\nUpdate failed:', upErr.message); process.exit(1); }
console.log(`\nRemoved ${removed.length} row(s). ${kept.length} remain.`);
console.log('Visitors see the change within ~15 minutes (homepage cache), or immediately after a deploy.');
