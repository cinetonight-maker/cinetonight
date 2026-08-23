#!/usr/bin/env node
/**
 * Push one edited file from content/posts/ back into Supabase.
 *
 *   node scripts/import-post.mjs <slug>
 *   node scripts/import-post.mjs <slug> --dry     show the diff, write nothing
 *
 * The other half of scripts/export-posts.mjs. Only the fields present in the
 * file's frontmatter are written; id, slug, publish_at, created_at, view
 * counts, comments and revisions are never touched.
 *
 * THE SLUG IS AN ADDRESS, NOT A FIELD. This script will not rename a URL,
 * because renaming one without a redirect breaks every link to it. Move a URL
 * through the dashboard's Redirect Manager instead, which offers the redirect
 * as part of the rename.
 *
 * AFTER RUNNING THIS: press Publish on the post in the dashboard. A direct
 * database write does not clear the page cache — only the dashboard's publish
 * path does that. Without it the live page keeps the old copy for up to 30
 * minutes. See docs/D1-TAG-CACHE-BUG.md for why that matters.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';

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

const slug = process.argv[2];
const dry = process.argv.includes('--dry');
if (!slug) {
  console.error('Usage: node scripts/import-post.mjs <slug> [--dry]');
  process.exit(1);
}

const file = `content/posts/${slug}.md`;
if (!existsSync(file)) {
  console.error(`Not found: ${file}`);
  console.error('Run node scripts/export-posts.mjs first.');
  process.exit(1);
}

const raw = readFileSync(file, 'utf8');
const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!m) { console.error(`${file} has no --- frontmatter block.`); process.exit(1); }

const LIST_FIELDS = new Set(['secondary_keywords', 'tags']);
const BOOL_FIELDS = new Set(['noindex']);
/** Never written back: the slug is an address, and the rest are the database's
 *  own bookkeeping. */
const READ_ONLY = new Set(['slug', 'id', 'publish_at', 'created_at', 'updated_at']);

const front = {};
for (const line of m[1].split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const kv = line.match(/^([a-z_]+):\s*(.*)$/);
  if (!kv) continue;
  const [, k, v] = kv;
  if (READ_ONLY.has(k)) continue;
  const value = v.trim();
  front[k] = LIST_FIELDS.has(k) ? (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])
    : BOOL_FIELDS.has(k) ? value === 'true'
    : value === '' ? null
    : value;
}

const body = m[2].trim();
if (!body) { console.error('Body is empty. Refusing to blank a post.'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: before, error: findErr } = await sb.from('blog_posts')
  .select('id, slug, title, status').eq('slug', slug).maybeSingle();
if (findErr) { console.error('Could not read blog_posts:', findErr.message); process.exit(1); }
if (!before) { console.error(`No post at slug "${slug}". Nothing changed.`); process.exit(1); }

const words = body.replace(/^#{1,6}\s+.*$/gm, ' ').match(/\b[\p{L}\p{N}'-]+\b/gu)?.length ?? 0;
const h2 = (body.match(/^##\s+(.*)$/gm) ?? []).map((s) => s.replace(/^##\s+/, ''));
const realH2 = h2.filter((t) => !/^(faqs?|read next|comments?)$|frequently asked questions?/i.test(t.trim()));
const links = [...new Set([...body.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').matchAll(/\]\((\/[^)\s]*)\)/g)].map((x) => x[1]))];

console.log(`${slug}`);
console.log(`  title:    ${front.title ?? before.title}`);
console.log(`  body:     ${words} words · ${realH2.length} article sections · ${links.length} internal links`);
console.log(`  status:   ${before.status}${front.status && front.status !== before.status ? ` -> ${front.status}` : ''}`);
console.log(`  fields:   ${Object.keys(front).join(', ')}`);

if (dry) { console.log('\n--dry: nothing written.'); process.exit(0); }

const isMissingSchema = (e) => {
  const s = e?.message ?? '';
  return e?.code === '42703' || e?.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(s);
};

const CORE = ['title', 'cat', 'excerpt', 'read_label', 'status', 'meta_title', 'meta_description'];
const core = Object.fromEntries(Object.entries(front).filter(([k]) => CORE.includes(k)));
const extra = Object.fromEntries(Object.entries(front).filter(([k]) => !CORE.includes(k)));

let res = await sb.from('blog_posts').update({ ...core, ...extra, body }).eq('id', before.id).select().single();
let degraded = false;
if (res.error && isMissingSchema(res.error)) {
  degraded = true;
  res = await sb.from('blog_posts').update({ ...core, body }).eq('id', before.id).select().single();
}
if (res.error) { console.error('\nUpdate failed:', res.error.message, '\nNothing changed.'); process.exit(1); }

console.log('\nSaved.');
if (degraded) console.log('NOTE: SEO columns not saved — run supabase/blog_seo.sql, then re-run.');
console.log('NEXT: open this post in /admin and press Publish, or the live page keeps the old copy.');
