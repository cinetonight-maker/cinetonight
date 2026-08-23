#!/usr/bin/env node
/**
 * Upgrade EXISTING blog posts to proper heading structure.
 *
 * The blog renderer now understands "## " (H2) and "### " (H3) at the start
 * of a body line (app/blog/[slug]/page.tsx). Every post written before that
 * used bare short lines as pseudo-headings - same size as body text, and
 * invisible to Google's outline parsing. This script finds those lines and
 * prefixes them properly.
 *
 * SAFE BY DEFAULT - it is a DRY RUN unless you pass --apply:
 *   node scripts/restructure-post-headings.mjs           <- prints the plan, changes nothing
 *   node scripts/restructure-post-headings.mjs --apply   <- writes the changes
 *
 * What becomes a heading (only lines that are not already ## or ###):
 *   - Numbered list items:            "1. Crazy, Stupid, Love. - ..."  -> ##
 *   - Short question lines (FAQs):    "What should I watch on ...?"    -> ###
 *   - Short label lines with no closing punctuation:
 *                                     "How to choose the right ..."    -> ##
 * Everything else - real sentences ending in . ! ? etc. - is left alone.
 * Review the dry run before applying; if one line is misjudged, fix that
 * post by hand in Dashboard -> Blog Posts afterwards.
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
if (!url || !key) { console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');

/** Decide what a body line is. Returns the (possibly prefixed) line. */
function classify(line) {
  const t = line.trim();
  if (!t || t.startsWith('## ') || t.startsWith('### ')) return t; // already structured
  const words = t.split(/\s+/).length;

  // Numbered entries ("1. Movie Name - best for...") are the section spine
  // of every listicle -> H2.
  if (/^\d+\.\s/.test(t) && t.length <= 110) return `## ${t}`;

  // Short standalone questions are FAQ-style sub-headings -> H3.
  // (Real paragraphs that merely END in a question are long; 80 chars and
  //  no sentence period inside keeps this to actual heading lines.)
  if (t.endsWith('?') && t.length <= 80 && !t.slice(0, -1).includes('.')) return `### ${t}`;

  // Short label lines with no closing punctuation ("How to choose the right
  // date night movie", "Final pick", "Frequently asked questions") -> H2.
  if (words <= 10 && t.length <= 70 && !/[.!?:;,'"…]$/.test(t)) return `## ${t}`;

  return t; // ordinary paragraph
}

const { data: posts, error } = await sb
  .from('blog_posts')
  .select('id, slug, title, body')
  .order('created_at', { ascending: true });
if (error) { console.error('Could not read posts:', error.message); process.exit(1); }

let changedPosts = 0;
for (const p of posts ?? []) {
  const body = Array.isArray(p.body) ? p.body : [];
  if (!body.length) { console.log(`- ${p.slug}: no body, skipped`); continue; }

  const next = body.map(classify);
  const changes = body.map((line, i) => [line, next[i]]).filter(([a, b]) => a !== b);
  if (!changes.length) { console.log(`- ${p.slug}: already structured, no changes`); continue; }

  changedPosts++;
  console.log(`\n=== ${p.slug} (${changes.length} heading${changes.length === 1 ? '' : 's'}) ===`);
  for (const [, after] of changes) console.log(`  + ${after}`);

  if (APPLY) {
    const { error: upErr } = await sb.from('blog_posts').update({ body: next }).eq('id', p.id);
    console.log(upErr ? `  FAILED: ${upErr.message}` : '  saved.');
  }
}

console.log(`\n${changedPosts} post(s) ${APPLY ? 'updated' : 'would be updated'}.`);
if (!APPLY && changedPosts) console.log('Looks right? Re-run with --apply to save.');
if (APPLY) console.log('Posts are ISR-cached ~30 min; the new structure appears on the site within that window.');
