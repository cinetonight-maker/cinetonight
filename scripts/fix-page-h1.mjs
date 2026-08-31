#!/usr/bin/env node
/**
 * Remove a leading H1 from a custom page's body in Supabase.
 *
 *   node scripts/fix-page-h1.mjs <slug>
 *   node scripts/fix-page-h1.mjs <slug> --dry
 *   node scripts/fix-page-h1.mjs --all --dry     check every published page
 *
 * WHY THIS EXISTS: app/[slug]/page.tsx renders the page's `title` as the
 * <h1>. scripts/seed-legal-pages.mjs also began each body with "# Title".
 * The result is TWO h1 elements with the same words, and the heading appears
 * visibly twice on the live page - confirmed on /privacy-policy and
 * /terms-of-service. Same defect that hit four blog posts.
 *
 * Deliberately surgical: it removes ONLY a leading H1 line (and the blank
 * line after it). It never rewrites, reflows or replaces body copy, so it is
 * safe to run against pages whose current text nobody has reviewed.
 *
 * AFTER RUNNING: press Publish on the page in /admin to clear the cached read.
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
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const all = args.includes('--all');
const slug = args.find((a) => !a.startsWith('--'));
if (!slug && !all) {
  console.error('Usage: node scripts/fix-page-h1.mjs <slug> [--dry]   |   --all [--dry]');
  process.exit(1);
}

/** Strips a leading "# Heading" line plus any blank line directly after it.
 *  Returns null when the body does not start with an H1, so the caller can
 *  report "nothing to do" rather than writing an identical row. */
function stripLeadingH1(body) {
  const lines = String(body ?? '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;      // leading blanks
  if (i >= lines.length || !/^#\s+\S/.test(lines[i])) return null;
  const heading = lines[i].trim();
  lines.splice(i, 1);
  while (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
  return { heading, body: lines.join('\n').trim() };
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  let q = sb.from('pages').select('slug, title, content, status');
  if (!all) q = q.eq('slug', slug);
  const { data, error } = await q;
  if (error) { console.error('Read failed:', error.message); return 1; }
  if (!data?.length) { console.error(all ? 'No pages found.' : `No page with slug "${slug}".`); return 1; }

  let touched = 0;
  for (const page of data) {
    const res = stripLeadingH1(page.content);
    if (!res) { if (!all) console.log(`/${page.slug}: no leading H1, nothing to do.`); continue; }
    touched++;
    console.log(`/${page.slug}  (title: "${page.title}")`);
    console.log(`  ${dry ? 'would remove' : 'removing'}: ${res.heading}`);
    if (dry) continue;
    const up = await sb.from('pages')
      .update({ content: res.body, updated_at: new Date().toISOString() })
      .eq('slug', page.slug);
    if (up.error) { console.error(`  write failed: ${up.error.message}`); return 1; }
    console.log('  done');
  }

  if (!touched) { console.log('Nothing to fix.'); return 0; }
  console.log(dry
    ? `\n--dry: ${touched} page(s) would change, nothing written.`
    : `\n${touched} page(s) updated. Now press Publish on each in /admin to clear the cached read.`);
  return 0;
}

process.exitCode = await main();
