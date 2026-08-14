#!/usr/bin/env node
/**
 * Seed the first batch of OTT release-date posts as DRAFTS.
 * Run once from the project root:  node scripts/seed-ott-posts.mjs
 * Safe to re-run: existing slugs are never overwritten.
 *
 * These are "tracker" posts: publish now while the query is spiking, then
 * UPDATE the same post when the exact date or platform is confirmed. One
 * URL accumulates search authority instead of splitting it across posts.
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

const dateLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const POSTS = [
  {
    slug: 'cocktail-2-ott-release-date',
    title: 'Cocktail 2 OTT Release Date: When and Where to Watch It Online',
    cat: 'News',
    meta_title: 'Cocktail 2 OTT Release Date: Where to Watch Online',
    meta_description: 'Cocktail 2 is confirmed for Netflix. Here is the latest on its OTT release date, where to stream Shahid Kapoor and Kriti Sanon’s sequel, and what to expect.',
    excerpt: 'The Shahid Kapoor, Kriti Sanon and Rashmika Mandanna sequel is headed to Netflix. Here is everything we know about its streaming release, updated as soon as the date is confirmed.',
    body: [
      'Cocktail 2, the long awaited sequel starring Shahid Kapoor, Kriti Sanon and Rashmika Mandanna, is officially headed to Netflix for its digital premiere. If you missed it in theatres or want to watch it again from your couch, here is everything we know about its OTT release, and we update this page the moment anything is confirmed.',
      'The short answer: Cocktail 2 will stream on Netflix, with its digital premiere reported for August 2026. An exact day has not been announced by Netflix at the time of writing. Based on how Bollywood theatrical windows have worked this year, roughly six to eight weeks after the cinema release, the film is expected on the platform within this window.',
      'When it arrives, watching it is simple: the film will be included with any Netflix subscription, from the mobile plan upward, in India, Pakistan, Bangladesh and most other regions, usually in Hindi with subtitles, and often with dubbed audio tracks added at launch.',
      'Why the excitement? The original Cocktail became a modern romance favorite, and the sequel pairs Shahid Kapoor with two of the biggest female leads working today. Early word from its theatrical run praised the soundtrack and the chemistry of the leads, which is exactly the kind of film that finds an even bigger audience on streaming.',
      'Until it lands, you can watch the trailer, check ratings and see live availability for Cocktail 2 right here on CineTonight: search the title and the Where to Watch panel will show the moment Netflix lists it in your country. Bookmark this post, we update it the day the date drops.',
      'Frequently asked questions',
      'When is Cocktail 2 releasing on OTT?',
      'Cocktail 2 is confirmed for Netflix, with the digital premiere reported for August 2026. The exact day has not been officially announced yet. This page is updated as soon as it is.',
      'Which OTT platform has Cocktail 2?',
      'Netflix holds the streaming rights. It will not be on Prime Video, JioHotstar or ZEE5.',
      'Is Cocktail 2 free to watch online?',
      'No. Any site offering it free before its official release is piracy. It will be included with a standard Netflix subscription once released.',
    ],
    imgPrompt: 'A stylish dark cinematic image: two cocktail glasses clinking in front of a glowing screen in a dark room, soft purple neon glow, moody premium lighting, no faces, no text, no logos, photorealistic, 16:9 widescreen.',
  },
  {
    slug: 'jana-nayagan-ott-release-date',
    title: 'Jana Nayagan OTT Release Date: When Vijay’s Film Streams on ZEE5',
    cat: 'News',
    meta_title: 'Jana Nayagan OTT Release Date: Vijay’s Film on ZEE5',
    meta_description: 'Jana Nayagan is coming to ZEE5. The latest on Vijay’s film and its OTT release date, where to watch it online, and language options, updated as confirmed.',
    excerpt: 'Thalapathy Vijay’s Jana Nayagan is headed to ZEE5 for its digital premiere. Here is the latest on its OTT release date and where to watch, updated as news is confirmed.',
    body: [
      'Jana Nayagan, starring Thalapathy Vijay, is set for its digital premiere on ZEE5, one of the biggest OTT arrivals of the season for South Indian cinema fans. Here is everything we know about when and where you can stream it, and we keep this page updated as details are confirmed.',
      'The short answer: ZEE5 holds the streaming rights, with the premiere reported for August 2026. The exact date has not been announced at the time of writing. Vijay films typically arrive on streaming roughly four to eight weeks after their theatrical release, and ZEE5 usually announces the date about a week in advance.',
      'Expect the film to stream in Tamil along with dubbed versions, commonly Telugu and Hindi, either at launch or shortly after. A standard ZEE5 subscription covers it: the platform runs monthly and yearly plans, and the film will be included rather than a separate rental.',
      'Jana Nayagan matters beyond the usual star vehicle excitement. Every Vijay release is an event across Tamil Nadu and far beyond, and his films consistently top streaming charts in their first week. If you are outside India, check availability where you live: ZEE5 operates in many countries, and the Where to Watch panel on CineTonight shows live availability for your region once the film is listed.',
      'Until then, the trailer, cast details and ratings are all on the film’s page here on CineTonight. Bookmark this post: the moment ZEE5 confirms the date, it appears here.',
      'Frequently asked questions',
      'When is Jana Nayagan releasing on OTT?',
      'The film is headed to ZEE5, reported for August 2026. The exact day is not yet officially announced. This page updates as soon as it is.',
      'Which platform will stream Jana Nayagan?',
      'ZEE5 holds the digital rights. It will not stream on Netflix, Prime Video or JioHotstar.',
      'Will Jana Nayagan be available in Hindi?',
      'Vijay’s recent films have streamed with Hindi and Telugu dubs on their OTT premiere or shortly after, and the same is expected here.',
    ],
    imgPrompt: 'A dramatic dark cinematic image: a single spotlight beam hitting an empty film stage with floating dust, deep navy black background with a subtle purple glow on one side, epic mood, no people, no text, no logos, photorealistic, 16:9 widescreen.',
  },
  {
    slug: 'michael-ott-release-date-jiohotstar',
    title: 'Michael OTT Release Date: The Michael Jackson Biopic Streams August 29',
    cat: 'News',
    meta_title: 'Michael OTT Release Date: Biopic on JioHotstar Aug 29',
    meta_description: 'Michael, the Michael Jackson biopic, streams on JioHotstar from August 29, 2026. Where to watch it online, subscription info and what to expect.',
    excerpt: 'The Michael Jackson biopic arrives on JioHotstar on August 29, 2026. Here is where to watch it, what you need, and why it is one of the year’s biggest music films.',
    body: [
      'Michael, the biopic of the King of Pop starring his nephew Jaafar Jackson, has its OTT release date locked: the film streams on JioHotstar from August 29, 2026. Here is everything you need to watch it the day it drops.',
      'The essentials: JioHotstar carries the film in India from August 29. It is included with a JioHotstar subscription, from the mobile plan upward, with no separate rental fee. English audio with subtitles is standard for Hollywood titles on the platform, and dubbed tracks often follow.',
      'The film covers Michael Jackson’s rise from the Jackson 5 to the biggest entertainer on the planet, with Jaafar Jackson’s casting widely praised for an uncanny resemblance in both look and movement. For a generation that knows the music but never saw the phenomenon, this is the streaming event version of a history lesson with the greatest soundtrack imaginable.',
      'If you are outside India, availability differs by region since streaming rights for the film are split across platforms internationally. Open the film’s page on CineTonight and the Where to Watch panel shows live options for the country you are browsing from.',
      'One practical tip: biopics like this one climb the Top 10 fast on release weekend. It premieres on a Saturday, so if your plan is a family watch, that first weekend is the moment. The trailer and cast details are on our site now.',
      'Frequently asked questions',
      'When does Michael release on OTT in India?',
      'August 29, 2026 on JioHotstar, included with any subscription tier.',
      'Do I need a special plan to watch Michael on JioHotstar?',
      'No. Any active JioHotstar plan includes it, from mobile to premium.',
      'Where can I watch Michael outside India?',
      'Rights vary by country. Check the film’s page on CineTonight: the Where to Watch panel shows live availability for your region.',
    ],
    imgPrompt: 'A dark stage with a single sparkling white glove resting under a spotlight, sequins catching purple and white light, black background with subtle stage haze, iconic and elegant, no faces, no text, no logos, photorealistic, 16:9 widescreen.',
  },
];

for (const p of POSTS) {
  const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', p.slug).maybeSingle();
  if (existing) { console.log('skip (exists):', p.slug); continue; }
  const { error } = await sb.from('blog_posts').insert({
    slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt, body: p.body,
    meta_title: p.meta_title, meta_description: p.meta_description,
    date_label: dateLabel, read_label: '4 min', status: 'draft',
  });
  console.log(error ? ('FAIL ' + p.slug + ': ' + error.message) : ('seeded draft: ' + p.slug));
}
console.log('Done. Image prompts for each post are in this file (imgPrompt fields) and in the chat.');
