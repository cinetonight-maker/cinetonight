#!/usr/bin/env node
/**
 * "Can't Decide What To Watch Tonight?" — the first post written against the
 * new CMS publish checklist (lib/blogSeo.ts). Scores 15/15 apart from the
 * featured image, which has to be uploaded in the dashboard.
 *
 * Run once from the project root:  node scripts/seed-cant-decide-post.mjs
 *
 * SAFE TO RE-RUN. It upserts on the slug, so a second run updates the row
 * rather than creating a duplicate. It never touches any other post.
 *
 * KEYWORD DECISIONS:
 * - Primary: "can't decide what to watch tonight" — a question-shaped
 *   long-tail phrase with clear intent and thin competition, which is the
 *   gap a small site can actually win. It appears in the title, the meta
 *   description, the slug (apostrophe dropped), the opening paragraph and
 *   one H2 — five placements, which is where the checklist stops.
 * - Secondary, worked into natural copy: movies to watch tonight, what movie
 *   should i watch, movies when you don't know what to watch, movies based
 *   on mood.
 * - Evergreen slug, no date, because the topic never expires.
 *
 * SCHEDULED: 22 August 2026, 09:00 Pakistan time (04:00 UTC). Change
 * PUBLISH_AT below for a different slot.
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

const PUBLISH_AT = '2026-08-22T04:00:00Z';   // 09:00 Pakistan time
const SLUG = 'cant-decide-what-to-watch-tonight';

const BODY = `# Can't Decide What To Watch Tonight? Movies For Every Mood

Can't decide what to watch tonight? You are not short of films — you are short of a way to choose. Choosing a movie should be the exciting part of the evening, and instead it becomes the hardest part of it.

You open a streaming app, scroll through hundreds of titles, watch three trailers, and still end up with nothing playing. The problem is almost never a lack of movies. It is having too many, all presented the same way, with nothing to tell you which one fits tonight.

The fix is simple: stop asking *what is good* and start asking *how do I feel right now*. Mood narrows hundreds of options down to a handful in about ten seconds, and the handful is usually right.

## Start With Your Mood, Not The Catalogue

Every recommendation below is built around a feeling rather than a genre label. Pick the line that sounds like your evening and go straight to it — or let [CineTonight Discover](/discover) do the narrowing for you.

## Movies To Watch When You Want Something Relaxing

Sometimes you do not want to be challenged. You want something comfortable that quietly makes the evening better.

Relaxing films work best for:

- a quiet night at home
- watching after a long day
- casual weekend viewing when nobody wants to commit

Gentle dramas and warm comedies do this better than anything else. [Browse comedy](/movies?genre=Comedy) when you want the volume turned down on your day.

## Movies To Watch When You Want Something Exciting

Other nights you want the opposite — tension, momentum, a story that will not let you check your phone.

Look for:

- thrillers
- crime stories
- action films
- mysteries with a real puzzle in them

Start with [thrillers](/movies?genre=Thriller), or see [what is trending tonight](/trending) if you would rather watch what everyone else is talking about.

## Movies To Watch When You Want Something Funny

Comedy is the safest choice when more than one person is picking, because it asks the least of everyone.

It is the right call when you want:

- an easy watch
- something enjoyable with friends
- a lighter evening after a heavy week

## Movies To Watch When You Want Something Emotional

Some films stay with you long after the credits. They are not the ones to put on casually, but they are the ones you remember years later.

Look for:

- powerful dramas
- character stories that take their time
- emotional journeys with something real underneath

[Drama](/movies?genre=Drama) is the place to start, and it is worth choosing a night when you can actually give it your attention.

## Movies To Watch When You Only Have A Short Time

A shorter film is not a lesser film. It is often a tighter one.

Short works well when you:

- have limited time before bed
- want a complete story in one sitting
- are watching on a weeknight

If you would rather not pay for something you may not finish, [free classic movies](/free-movies) are full films, legal to stream, and many of them run under two hours.

## Movies To Watch When You Want Something Different

If everything on your home screen looks the same, the answer is usually to leave your usual language or region.

Try:

- international cinema
- Korean films and series
- hidden gems with small audiences and big reputations
- [web series](/web-series) when you want something to return to

## Still Can't Decide What To Watch Tonight?

If you have read this far and still have nothing playing, stop browsing and answer one question instead of a hundred.

CineTonight picks for you based on:

- your mood
- the kind of experience you want
- the style of film you enjoy
- how much time you actually have

[Open Discover](/discover) and get a recommendation built around what you want tonight, rather than what happens to be promoted this week.

## Final Thoughts

Finding a film should not feel like another task at the end of the day.

The best movie is not the most popular one, the highest rated one, or the one at the top of the row. It is the one that fits the mood you are in right now — and once you choose that way, deciding takes a minute instead of an hour.`;

/** Columns every install has. */
const BASE = {
  slug: SLUG,
  title: "Can't Decide What To Watch Tonight? Movies For Every Mood",
  cat: 'Guides',
  excerpt: 'Choosing a movie should be exciting, but it often becomes the hardest part of the night. Start with how you feel and the list narrows itself in seconds.',
  body: BODY,
  date_label: '22 Aug 2026',
  read_label: '4 min',
  status: 'scheduled',
  publish_at: PUBLISH_AT,
  meta_title: "Can't Decide What To Watch Tonight? Movies For Every Mood",
  meta_description: "Can't decide what to watch tonight? Find movies based on your mood, from relaxing and funny picks to thrillers, emotional stories, and hidden gems.",
};

/** Columns added by supabase/blog_cms.sql and supabase/blog_seo.sql. Applied
 *  separately so the seed still works if either file has not been run — the
 *  write retries without them rather than failing outright, exactly like
 *  /api/admin/blog does. */
const EXTRA = {
  image_alt: 'Someone scrolling a streaming app, unable to decide what to watch',
  tags: ['mood', 'what to watch', 'recommendations', 'discover'],
  focus_keyword: "can't decide what to watch tonight",
  secondary_keywords: [
    'movies to watch tonight',
    'what movie should i watch',
    "movies when you don't know what to watch",
    'movies based on mood',
  ],
  canonical_url: null,   // blank: this article is its own canonical
  og_image: null,        // falls back to the featured image
  noindex: false,
};

const isMissingSchema = (e) => {
  const m = e?.message ?? '';
  return e?.code === '42703' || e?.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(m);
};

const { data: existing } = await sb.from('blog_posts').select('id, status').eq('slug', SLUG).maybeSingle();

let res = await sb.from('blog_posts').upsert({ ...BASE, ...EXTRA }, { onConflict: 'slug' }).select().single();
let degraded = false;
if (res.error && isMissingSchema(res.error)) {
  degraded = true;
  res = await sb.from('blog_posts').upsert(BASE, { onConflict: 'slug' }).select().single();
}
if (res.error) {
  console.error('Failed:', res.error.message);
  process.exit(1);
}

const when = new Date(PUBLISH_AT);
console.log(existing ? 'Updated the existing post.' : 'Created the post.');
console.log(`  ${res.data.title}`);
console.log(`  /blog/${res.data.slug}`);
console.log(`  status: ${res.data.status}`);
console.log(`  goes live: ${when.toUTCString()}  (${when.toLocaleString('en-GB', { timeZone: 'Asia/Karachi' })} Pakistan time)`);
if (degraded) {
  console.log('');
  console.log('  NOTE: the SEO columns were not saved — run supabase/blog_seo.sql');
  console.log('        (and supabase/blog_cms.sql) in Supabase, then re-run this.');
}
console.log('');
console.log('STILL TO DO: upload a featured image in the dashboard');
console.log('  /admin -> Blog Posts -> this post -> Featured image');
console.log('  Everything else is set. The checklist goes to 15/15 once it has one.');
