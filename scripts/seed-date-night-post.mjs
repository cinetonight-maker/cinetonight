#!/usr/bin/env node
/**
 * Date-night guide — SEO-improved version of the draft, scheduled for the
 * next slot in the cadence (tomorrow 9 AM PKT).
 * Run once from the project root:  node scripts/seed-date-night-post.mjs
 *
 * KEYWORD DECISIONS (structural, not from a paid volume tool):
 * - Primary: "best date night movies" — the commercial head variant. The
 *   bare head "date night movies" is folded in automatically (any page
 *   ranking for "best date night movies" targets it), and the question
 *   form "what to watch on date night" is kept in the title tail + opening
 *   + FAQ, which is what wins featured snippets / AI-answer citations.
 * - Secondary, worked into natural copy: movies to watch as a couple,
 *   couple movie night, romantic comedies for date night, first date
 *   movies, cozy movies to watch together.
 * - Slug carries the primary: best-date-night-movies.
 * - This is an EVERGREEN listicle (unlike the OTT trackers), so the copy
 *   avoids anything that dates it — no "this year", no platform claims.
 *
 * Safe to re-run: skips the slug if it already exists.
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

const POST = {
  slug: 'best-date-night-movies',
  status: 'scheduled',
  publish_at: '2026-08-19T04:00:00Z', // 9 AM PKT, next slot after the Doomsday guide
  date_label: '19 Aug 2026',
  read_label: '9 min',
  cat: 'Guides',
  title: '15 Best Date Night Movies for Couples: What to Watch Tonight',
  meta_title: '15 Best Date Night Movies for Couples (Every Mood)',
  meta_description: 'The best date night movies for couples — romantic comedies, mysteries, adventures and thoughtful dramas, plus a fast way to pick one and start watching.',
  excerpt: 'Not sure what to watch on date night? These 15 movies cover every kind of couple and every kind of evening — romantic, funny, mysterious and thoughtful — plus a simple way to choose one in minutes instead of an hour.',
  body: [
    'Choosing what to watch on date night should be the easy part. In reality, couples often spend more time scrolling through movies than actually watching one.',
    'The best date night movies depend on the kind of evening you want. Some nights call for romance and laughter. Others are better with a mystery, an adventure, or something thoughtful enough to keep the conversation going after the credits.',
    'This guide covers 15 movies to watch as a couple across every mood — from light romantic comedies to thrillers and emotional dramas — followed by a quick way to actually pick one.',
    'How to choose the right date night movie',
    'A good date night movie does not have to be a love story. What matters more is choosing something that works for both people and matches the mood of the evening.',
    'For a relaxed couple movie night at home, comedy and lighter romance usually work well. If you both enjoy discussing movies afterward, a mystery or thoughtful drama makes the evening more interesting. First dates usually benefit from something entertaining and accessible, while long-term couples are often more comfortable with emotionally heavier films.',
    'Runtime matters too. If dinner ran late or you only have a couple of hours, a shorter movie beats starting something you will struggle to finish.',
    'Here are 15 strong options for different kinds of date nights.',
    '1. Crazy, Stupid, Love. — best for romance with plenty of comedy',
    'Crazy, Stupid, Love. is an easy choice when you want something romantic without making the whole evening overly sentimental. It mixes several relationship stories with sharp comedy and enough surprises to keep the movie moving.',
    'The combination of romance, awkward situations and humor makes it one of the most reliable date night movies for couples who want something comfortable that still gives them something to talk about. Choose this when neither of you wants anything too serious.',
    '2. About Time — best for a warm and emotional night',
    'About Time works when you want something more heartfelt. Romance is central to the story, but the film is also about family, everyday life and appreciating ordinary moments — which makes it more emotionally satisfying than a typical romantic comedy.',
    'It is a strong choice for a cozy movie night at home when you want warmth rather than flash.',
    '3. 10 Things I Hate About You — best for a fun, nostalgic evening',
    'Sometimes the right pick is simply something charming and familiar. 10 Things I Hate About You has humor, romance and enough personality to stay entertaining even on a rewatch.',
    'It is especially good when you want a lighter evening without spending twenty minutes debating which movie is "worth it" — and it works well for couples who love older romantic comedies with memorable characters.',
    '4. Palm Springs — best for couples who want something different',
    'Palm Springs starts with the ingredients of a romantic comedy and takes the story somewhere much stranger. It is funny, unpredictable and easy to watch, while still giving the central relationship enough depth to matter.',
    'That makes it a great pick when you want romance but are tired of traditional love stories. Choose it for a playful date night with an unusual edge.',
    '5. Before Sunrise — best for a conversation-focused night',
    'Before Sunrise is ideal when the appeal of date night is as much about talking as watching. The film is built on conversation, connection and two people getting to know each other.',
    'It is quieter than most options on this list, and that is exactly why it works: it leads naturally into your own conversation afterward. Best for couples who enjoy character-driven cinema.',
    '6. Crazy Rich Asians — best for a glamorous romantic night',
    'If you want romance with more spectacle, Crazy Rich Asians is the easy option. It combines comedy, family tension, romance and an extravagant visual style that makes movie night feel like an occasion.',
    'It is accessible and energetic — the right choice when you want something romantic without committing to a slow drama.',
    '7. The Big Sick — best for smart comedy and grounded romance',
    'The Big Sick suits couples who prefer their romantic movies to feel real. The humor matters, but so do the complications around relationships, family and commitment.',
    'The result is a film that can be funny in one scene and emotionally serious in the next without becoming exhausting. Choose it when you want both laughter and substance.',
    '8. The Lost City — best for romance mixed with adventure',
    'Not every date night needs relationship drama. The Lost City blends comedy, romance and adventure — useful when one of you wants a romantic movie and the other would rather watch something with action.',
    'It is easy to follow and keeps the tone light, which makes it one of the better casual movie night ideas for couples who cannot agree on a genre.',
    '9. The Princess Bride — best cozy classic',
    'The Princess Bride mixes romance, humor, fantasy and adventure so thoroughly that it refuses to sit in one category — and that versatility is exactly why it works for date night.',
    'There is enough romance for the evening to feel right, but the film never depends on romance alone to stay entertaining. A perfect comfort pick.',
    '10. Knives Out — best for couples who would rather watch a mystery',
    'Your date night movie does not have to be romantic at all. Knives Out is the pick when you both enjoy twists and trying to solve the case before the film does.',
    'A mystery also creates a shared activity: you compare theories, suspect different characters, and argue about whether either of you saw the ending coming. Choose this when you want the movie itself to become part of the date.',
    '11. La La Land — best for romance with something to discuss afterward',
    'La La Land brings together romance, music, ambition and hard choices. It is striking enough to make the night feel special, and there is more underneath than a simple love story.',
    'Pick it when you want romance without a completely predictable ending.',
    '12. Rye Lane — best fresh, energetic romantic comedy',
    'Rye Lane is the option when you want something lively and modern. It follows two people spending a day together and slowly finding a connection, which gives it intimacy without ever slowing down.',
    'It is also the right answer when you want something less obvious than the usual romantic comedy favorites.',
    '13. The Idea of You — best contemporary romance',
    'The Idea of You suits a date night where you want a modern romantic story with adult complications. It balances attraction against two lives that do not fit together easily, which gives it more tension than a simple meet-cute.',
    '14. Anyone But You — best easygoing pick',
    'Sometimes the choice should not be complicated. Anyone But You fits an evening where you mainly want something light, attractive and effortless to watch together.',
    'It is especially useful after a long day when neither of you wants a demanding plot. Make some food, get comfortable, and let the movie do the rest.',
    '15. Past Lives — best for established couples who want something thoughtful',
    'Past Lives is a very different recommendation from the lighter films above. It is quiet, reflective and emotionally complicated — about connection, timing and the other lives people might have lived.',
    'It may not be the best first date movie. For couples who enjoy serious cinema, though, it can lead to the most interesting conversation of the evening.',
    'Best date night movies by mood',
    'If you still cannot decide, start from the kind of evening you want. For something funny: Crazy, Stupid, Love. or 10 Things I Hate About You. For something romantic: About Time or Crazy Rich Asians. For something different: Palm Springs or Rye Lane. For something adventurous: The Lost City or The Princess Bride. For something mysterious: Knives Out. For something thoughtful: Before Sunrise, La La Land or Past Lives.',
    'Choosing by mood is almost always faster than comparing dozens of unrelated titles.',
    'What should you watch on a first date?',
    'For a first date movie, choose something entertaining without being emotionally overwhelming. A comedy, light romance, mystery or adventure gives you natural moments to laugh and talk without making the evening feel heavy. Palm Springs, Knives Out, Crazy, Stupid, Love. and The Lost City are all safe, strong choices. The goal is not proving you have perfect taste — it is picking something you can both enjoy.',
    'What should long-term couples watch on date night?',
    'Couples who already know each other’s tastes have more freedom: revisit an old favorite, pick something neither of you would normally choose, or go emotionally deeper. Before Sunrise, Past Lives and La La Land all reward couples who want the film to continue into a conversation. Alternating who chooses each time also keeps movie night interesting.',
    'Date night does not have to mean a romantic movie',
    'This is the easiest mistake to make. If neither of you particularly enjoys romance, do not force one just because it is date night. A mystery like Knives Out, an adventure like The Lost City, or a thriller can work far better if that is what you both actually enjoy. The best date night movie is the one you are both still happy to be watching twenty minutes in.',
    'Where to watch these movies',
    'Streaming availability changes by country and by service. Instead of opening several apps to search one by one, look the title up on CineTonight — every movie page shows current Where to Watch options for your region. You can also save titles to My List before date night, so you already have a shortlist when it is time to choose.',
    'Make choosing part of the date',
    'If you regularly spend longer choosing than watching, change the process: pick the mood first, agree a rough runtime, then check what is on the services you already pay for. That turns hundreds of possibilities into a shortlist of three or four. And if you still cannot agree, open CineTonight’s homepage and let it pick for you — choose a mood or a Quick Pick like Date Night, and it will suggest something with an honest reason why it fits.',
    'Frequently asked questions',
    'What is a good movie to watch on date night? A good date night movie suits both people’s tastes and the mood of the evening. Crazy, Stupid, Love. is a strong all-round choice for romance and comedy, while Knives Out is the pick if you would rather share a mystery.',
    'Does a date night movie have to be romantic? No. A comedy, thriller, mystery, adventure or drama all work. The only rule is choosing something you will both enjoy watching together.',
    'What should I watch on a first date? Light comedy, romantic comedy, mystery and adventure are the comfortable zones. Palm Springs, The Lost City and Knives Out are entertaining without making the evening too intense.',
    'What are good cozy movies to watch together? About Time, The Princess Bride, Crazy Rich Asians and 10 Things I Hate About You are all warm, easy picks to settle into.',
    'How can we choose a movie faster? Decide three things first: mood, runtime and which streaming services you have. That collapses the list to a handful of options — and CineTonight’s mood picker can close the decision from there.',
    'Final pick',
    'There is no single perfect date night movie, because every couple and every evening is different. For an easy romantic comedy, start with Crazy, Stupid, Love. For something warm, choose About Time. For mystery, try Knives Out. For something thoughtful, watch Before Sunrise. And when neither of you wants to choose, let CineTonight find one from your mood, your time and your services. The point is spending less time scrolling and more time watching together.',
  ],
  tmdb: { kind: 'movie', query: 'Crazy Stupid Love', fallback: { kind: 'movie', query: 'La La Land' } },
};

async function tmdbBackdrop(spec) {
  if (!spec) return null;
  const q = new URLSearchParams({ api_key: tmdbKey, query: spec.query });
  const res = await fetch(`https://api.themoviedb.org/3/search/${spec.kind}?${q}`);
  const data = await res.json();
  const hit = (data.results ?? []).find((r) => r.backdrop_path) ?? (data.results ?? [])[0];
  const img = hit?.backdrop_path ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`
    : hit?.poster_path ? `https://image.tmdb.org/t/p/w780${hit.poster_path}` : null;
  if (img) return img;
  return spec.fallback ? tmdbBackdrop(spec.fallback) : null;
}

const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', POST.slug).maybeSingle();
if (existing) { console.log('skip (exists):', POST.slug); process.exit(0); }
const image_url = await tmdbBackdrop(POST.tmdb).catch(() => null);
const { error } = await sb.from('blog_posts').insert({
  slug: POST.slug, title: POST.title, cat: POST.cat, excerpt: POST.excerpt, body: POST.body,
  meta_title: POST.meta_title, meta_description: POST.meta_description,
  date_label: POST.date_label, read_label: POST.read_label, status: POST.status,
  publish_at: POST.publish_at, ...(image_url ? { image_url } : {}),
});
console.log(error ? `FAIL ${POST.slug}: ${error.message}`
  : `scheduled for ${POST.publish_at}: ${POST.slug}${image_url ? ' (image set)' : ' (NO IMAGE FOUND, add one in dashboard)'}`);
console.log('Dashboard -> Blog Posts will show it as "scheduled 19 Aug 2026" until it goes live, then "live".');
