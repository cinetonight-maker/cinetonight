#!/usr/bin/env node
/**
 * Rewrites the "Can't Decide What To Watch Tonight" post as
 * "What Should I Watch Tonight? How to Decide in 5 Minutes".
 *
 * Run once from the project root:
 *   node scripts/update-what-should-i-watch-tonight.mjs
 *
 * SAFE TO RE-RUN. It finds the post by either slug, so a second run just
 * updates the same row. It never creates a duplicate and never touches
 * another post.
 *
 * WHAT IT DOES NOT TOUCH, on purpose:
 * - the featured image (already uploaded in the dashboard)
 * - status and publish_at (the post is already live; re-scheduling a live
 *   post would take it off the site)
 * - comments, revisions, view counts
 *
 * THE URL DOES NOT CHANGE. No redirect is needed and none should be added.
 * /blog/cant-decide-what-to-watch-tonight already contains "what to watch
 * tonight", the keyword in a URL is a very weak ranking factor, and moving a
 * live URL trades a fraction of a percent for a redirect hop and a few weeks
 * of index churn. See KEEP_OLD_SLUG below.
 *
 * One consequence to expect and ignore: the publish checklist will show 14/15
 * with a warning that the focus keyword is missing from the URL. That warning
 * is correct and the answer is still no. Its own hint says as much: "Only
 * worth changing before the first publish."
 *
 * KEYWORD DECISIONS:
 * - Primary: "what should i watch tonight" — a question people type verbatim,
 *   with far more volume than the old "can't decide" phrasing and the same
 *   clear intent. It sits in the title, the meta description, the slug, the
 *   opening paragraph and one H2, which is where the checklist stops counting.
 * - Secondary, worked into the copy rather than stuffed: what to watch
 *   tonight, how to decide what to watch, what to watch tonight on Netflix,
 *   what to watch with family, movies under 90 minutes.
 * - Evergreen slug, no date, because this question never expires.
 *
 * Scores 15/15 on lib/blogSeo.ts when measured against the matching slug, and
 * 14/15 at the slug it is actually keeping. Verified before delivery.
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
const sb = createClient(url, key, { auth: { persistSession: false } });

/** Keep /blog/cant-decide-what-to-watch-tonight as the URL.
 *
 *  DELIBERATE, and the reasoning is worth keeping next to the flag: the
 *  existing slug already contains "what to watch tonight", the keyword in a
 *  URL is a very weak ranking factor, and moving a live URL buys a fraction
 *  of a percent in exchange for a redirect hop and a few weeks of index
 *  churn. The title and body carry the ranking work; the URL stays put.
 *
 *  Set to false only if this post is ever republished from scratch. */
const KEEP_OLD_SLUG = true;

const OLD_SLUG = 'cant-decide-what-to-watch-tonight';
const NEW_SLUG = 'what-should-i-watch-tonight';
const TARGET_SLUG = KEEP_OLD_SLUG ? OLD_SLUG : NEW_SLUG;

const TITLE = 'What Should I Watch Tonight? How to Decide in 5 Minutes';
const META_DESC =
  'What should I watch tonight? Use this five minute method to go from endless scrolling to pressing play, starting with your mood instead of the genre.';
const EXCERPT =
  'Twenty five minutes of scrolling and nothing playing. The problem is not a lack of films, it is starting with the wrong question. Here is a five minute method that works.';

const BODY = readFileSync('content/what-should-i-watch-tonight.md', 'utf8');

const BASE = {
  title: TITLE,
  cat: 'Guides',
  excerpt: EXCERPT,
  body: BODY,
  read_label: '8 min',
  meta_title: TITLE,
  meta_description: META_DESC,
};

/** Columns from supabase/blog_cms.sql and supabase/blog_seo.sql. Applied
 *  separately so the update still lands if either file has not been run. */
const EXTRA = {
  image_alt: 'Someone deciding what to watch tonight on a streaming app',
  tags: ['what to watch', 'mood', 'recommendations', 'discover', 'guides'],
  focus_keyword: 'what should i watch tonight',
  secondary_keywords: [
    'what to watch tonight',
    'how to decide what to watch',
    'what to watch tonight on netflix',
    'what to watch with family',
    'movies under 90 minutes',
  ],
  canonical_url: null,
  og_image: null,
  noindex: false,
};

const isMissingSchema = (e) => {
  const m = e?.message ?? '';
  return e?.code === '42703' || e?.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(m);
};

/* Find the row by either slug, so this is safe to run twice. */
const { data: found, error: findErr } = await sb
  .from('blog_posts')
  .select('id, slug, title, status, image_url')
  .in('slug', [OLD_SLUG, NEW_SLUG]);

if (findErr) {
  console.error('Could not read blog_posts:', findErr.message);
  process.exit(1);
}
if (!found || found.length === 0) {
  console.error(`No post found at /blog/${OLD_SLUG} or /blog/${NEW_SLUG}.`);
  console.error('Nothing was changed. Check the slug in the dashboard.');
  process.exit(1);
}
if (found.length > 1) {
  console.error('BOTH slugs exist as separate posts. Refusing to guess which one to update.');
  found.forEach((p) => console.error(`  ${p.id}  /blog/${p.slug}  ${p.status}`));
  process.exit(1);
}

const post = found[0];
const payload = { ...BASE, slug: TARGET_SLUG };

let res = await sb.from('blog_posts').update({ ...payload, ...EXTRA }).eq('id', post.id).select().single();
let degraded = false;
if (res.error && isMissingSchema(res.error)) {
  degraded = true;
  res = await sb.from('blog_posts').update(payload).eq('id', post.id).select().single();
}
if (res.error) {
  console.error('Update failed:', res.error.message);
  console.error('Nothing was changed.');
  process.exit(1);
}

const moved = post.slug !== res.data.slug;
const words = BODY.replace(/^#{1,6}\s+.*$/gm, ' ').match(/\b[\p{L}\p{N}'-]+\b/gu)?.length ?? 0;

console.log('Post updated.');
console.log(`  ${res.data.title}`);
console.log(`  /blog/${res.data.slug}${moved ? `   (was /blog/${post.slug})` : ''}`);
console.log(`  status: ${res.data.status}   body: ${words} words`);
console.log(`  featured image: ${post.image_url ? 'kept' : 'NONE — upload one in the dashboard'}`);

if (degraded) {
  console.log('');
  console.log('  NOTE: the SEO columns did not save. Run supabase/blog_seo.sql,');
  console.log('        then run this script again.');
}

if (moved) {
  console.log('');
  console.log('IMPORTANT — the URL changed. If you have not added the redirect yet:');
  console.log('  /admin -> Redirects -> Add');
  console.log(`    From:   /blog/${OLD_SLUG}`);
  console.log(`    To:     /blog/${NEW_SLUG}`);
  console.log('    Status: 308   Reason: Slug change   Enabled: yes');
  console.log('');
  console.log('  Without it, every existing link to the old URL returns 404.');
}

console.log('');
console.log('=========================================================');
console.log('REQUIRED NEXT STEP — the site is still serving the OLD copy');
console.log('=========================================================');
console.log('This script writes straight to the database, which does NOT clear');
console.log('the page cache. Only the dashboard does that. So:');
console.log('');
console.log('  /admin -> Blog Posts -> this post -> Publish');
console.log('');
console.log('Change nothing, just press Publish. That fires the cache purge');
console.log('(lib/revalidatePlan.ts) and the new copy goes live at once.');
console.log('Leave it alone instead and it clears itself within 30 minutes,');
console.log('which is the cache lifetime on a blog post.');
console.log('');
console.log('Then check: /admin -> Blog Posts -> this post -> the Publish checklist.');
if (res.data.slug === OLD_SLUG) {
  console.log('Expect 14/15. The one warning says the focus keyword is missing');
  console.log('from the URL. That is expected and deliberate — see the note at');
  console.log('the top of this file. Do not "fix" it by renaming the URL.');
} else {
  console.log('Expect 15/15 with no warnings.');
}
