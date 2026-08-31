#!/usr/bin/env node
/**
 * Push one edited file from content/pages/ into the Supabase `pages` table.
 *
 *   node scripts/import-page.mjs <slug>
 *   node scripts/import-page.mjs <slug> --dry     show what would change, write nothing
 *
 * The custom-page twin of scripts/import-post.mjs, and it follows the same
 * rules for the same reasons:
 *
 * THE SLUG IS AN ADDRESS, NOT A FIELD. This script will not rename a URL and
 * will not create a page that does not already exist. Renaming a live URL
 * without a redirect breaks every link to it; use the dashboard's Redirect
 * Manager, which offers the redirect as part of the rename.
 *
 * ONLY the fields present in the frontmatter are written. id, slug,
 * created_at, deleted_at and revision history are never touched.
 *
 * AFTER RUNNING THIS: open the page in /admin and press Publish. /[slug] is
 * force-dynamic, so there is no route cache to clear, but the Supabase read
 * behind it IS cached - publishing is what invalidates that data tag. Until
 * then the live page can serve the previous copy. See docs/CONTENT-RULES.md.
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
  console.error('Usage: node scripts/import-page.mjs <slug> [--dry]');
  process.exit(1);
}

const file = `content/pages/${slug}.md`;
if (!existsSync(file)) {
  console.error(`Not found: ${file}`);
  process.exit(1);
}

const raw = readFileSync(file, 'utf8');
const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
if (!m) { console.error(`${file} has no --- frontmatter block.`); process.exit(1); }

/** Writable columns. Anything else in the frontmatter is ignored rather than
 *  guessed at, so a typo can never silently blank a column. */
const ALLOWED = new Set(['title', 'meta_title', 'meta_description', 'status']);

const fields = {};
for (const line of m[1].split(/\r?\n/)) {
  const kv = line.match(/^([a-z_]+):\s*(.*)$/);
  if (!kv) continue;
  const k = kv[1];
  let v = kv[2].trim();
  // Frontmatter values may be quoted when they contain a colon.
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  if (ALLOWED.has(k) && v !== '') fields[k] = v;
}
fields.content = m[2].trim();

if (!fields.content) { console.error('Body is empty - refusing to write.'); process.exit(1); }

// The H1 trap, checked here so it cannot reach the database. The page
// template already renders `title` as the page's <h1>; a `# ` line in the
// body produces a SECOND one and the heading appears twice on the live page.
// This is the single most repeated content mistake on this project.
const firstHeading = fields.content.split(/\r?\n/).find((l) => /^#\s/.test(l));
if (firstHeading) {
  console.error('Body starts with an H1:', firstHeading.slice(0, 60));
  console.error('The template renders the title as the H1 already. Start the body at "## ".');
  process.exit(1);
}

if (fields.meta_title && fields.meta_title.length > 46) {
  console.error(`meta_title is ${fields.meta_title.length} chars; the site appends " - CineTonight", so 46 is the limit.`);
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

/* Everything past this point avoids process.exit().
 *
 * On Windows, exiting while the Supabase client still holds open libuv
 * handles throws "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
 * AFTER the work has already succeeded - alarming, and completely spurious.
 * Setting process.exitCode and returning lets node close its handles and
 * exit cleanly with the same status. */
async function main() {
  const { data: existing, error: readErr } = await sb
    .from('pages').select('*').eq('slug', slug).maybeSingle();
  if (readErr) { console.error('Read failed:', readErr.message); return 1; }
  if (!existing) {
    console.error(`No page with slug "${slug}". Create it in /admin first - this script updates, it never creates.`);
    return 1;
  }

  const changed = Object.entries(fields).filter(([k, v]) => existing[k] !== v);
  if (!changed.length) { console.log('No changes.'); return 0; }

  console.log(`${dry ? 'Would update' : 'Updating'} /${slug}:`);
  for (const [k, v] of changed) {
    const before = String(existing[k] ?? '');
    console.log(`  ${k}: ${before.length} chars -> ${String(v).length} chars`);
  }
  if (dry) { console.log('\n--dry: nothing written.'); return 0; }

  const { error } = await sb.from('pages')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('slug', slug);
  if (error) { console.error('Write failed:', error.message); return 1; }

  console.log(`\nDone. Now open /admin -> Pages -> ${slug} and press Publish to clear the cached read.`);
  return 0;
}

process.exitCode = await main();
