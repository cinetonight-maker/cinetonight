#!/usr/bin/env node
/**
 * Dump every blog post to content/posts/<slug>.md so it can be edited as a
 * file and pushed back with scripts/import-post.mjs.
 *
 *   node scripts/export-posts.mjs
 *
 * WHY THIS EXISTS: the blog cleanup phase touches most of the posts. Editing
 * them through the dashboard one field at a time is slow and leaves no diff;
 * reading them off the live site loses the exact source text. A round trip
 * through files gives full fidelity in both directions and a git history of
 * every content change.
 *
 * READ-ONLY. It never writes to the database. Overwrites local files, so do
 * not run it on top of edits you have not imported yet — it will warn first.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const OUT = 'content/posts';

/** Fields the cleanup phase actually edits. Anything not listed here is left
 *  alone by the importer, which is what keeps ids, timestamps, view counts and
 *  revisions out of harm's way. */
const FIELDS = [
  'title', 'cat', 'excerpt', 'read_label', 'status',
  'meta_title', 'meta_description', 'focus_keyword', 'secondary_keywords',
  'image_alt', 'canonical_url', 'noindex', 'tags',
];

/** The SEO columns only exist once supabase/blog_seo.sql has been run. */
const BASE_SELECT = 'id, slug, title, cat, excerpt, body, read_label, status, publish_at, image_url';
const SEO_SELECT = 'meta_title, meta_description, focus_keyword, secondary_keywords, image_alt, canonical_url, noindex, tags';

const yamlValue = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

/** Body has been markdown text since scripts/migrate-blog-markdown.mjs, but an
 *  older row could still hold the jsonb paragraph array. Handle both rather
 *  than silently writing "[object Object]" into a file. */
const bodyText = (b) => {
  if (typeof b === 'string') return b;
  if (Array.isArray(b)) return b.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n\n');
  return '';
};

let { data, error } = await sb.from('blog_posts')
  .select(`${BASE_SELECT}, ${SEO_SELECT}`).order('created_at', { ascending: false });
if (error) {
  ({ data, error } = await sb.from('blog_posts').select(BASE_SELECT).order('created_at', { ascending: false }));
  if (!error) console.log('NOTE: SEO columns not present — run supabase/blog_seo.sql for the full set.\n');
}
if (error) { console.error('Could not read blog_posts:', error.message); process.exit(1); }
if (!data?.length) { console.error('No posts found.'); process.exit(1); }

mkdirSync(OUT, { recursive: true });

// Refuse to silently clobber edits that were never imported.
const existing = existsSync(OUT) ? readdirSync(OUT).filter((f) => f.endsWith('.md')) : [];
if (existing.length && !process.argv.includes('--force')) {
  console.log(`${existing.length} exported file(s) already in ${OUT}/.`);
  console.log('Re-run with --force to overwrite them. Import any pending edits first.');
  process.exit(1);
}

for (const p of data) {
  const front = ['---', `slug: ${p.slug}`];
  for (const f of FIELDS) if (f in p) front.push(`${f}: ${yamlValue(p[f])}`);
  front.push(`# id: ${p.id}   (not editable)`, '---', '');
  writeFileSync(path.join(OUT, `${p.slug}.md`), front.join('\n') + '\n' + bodyText(p.body).trim() + '\n');
  const words = bodyText(p.body).replace(/^#{1,6}\s+.*$/gm, ' ').match(/\b[\p{L}\p{N}'-]+\b/gu)?.length ?? 0;
  const h2s = (bodyText(p.body).match(/^##\s+/gm) ?? []).length;
  console.log(`${String(words).padStart(5)}w  ${String(h2s).padStart(2)} H2  ${p.status.padEnd(9)} ${p.slug}`);
}

console.log(`\nExported ${data.length} posts to ${OUT}/`);
console.log('Edit the markdown, then: node scripts/import-post.mjs <slug>');
