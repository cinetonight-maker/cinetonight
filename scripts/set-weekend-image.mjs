#!/usr/bin/env node
/** One-time: attach the featured image to the live weekend post.
 *  Run from the project root:  node scripts/set-weekend-image.mjs */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const SLUG = 'what-to-watch-this-weekend-august-21-23-2026';
const IMAGE = 'https://ffpxgnibrmaixaeboluf.supabase.co/storage/v1/object/public/media/1787240081093-what-to-watch-at-weekend.webp';

const { data, error } = await sb.from('blog_posts')
  .update({ image_url: IMAGE })
  .eq('slug', SLUG)
  .select('id, title, image_url');

if (error) console.error('FAIL:', error.message);
else if (!data?.length) console.error('No post found with slug:', SLUG);
else console.log(`done: "${data[0].title}" now has the featured image.`);
