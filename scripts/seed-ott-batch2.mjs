#!/usr/bin/env node
/**
 * OTT tracker batch 2, mid August 2026.
 * Run once from the project root:  node scripts/seed-ott-batch2.mjs
 *
 * What it does:
 *  1. Updates the Cocktail 2 post to "now streaming" (the film premiered on
 *     Netflix on Aug 14) and publishes it immediately.
 *  2. Inserts 5 new tracker posts as SCHEDULED, one per morning at 9 AM
 *     Pakistan time (04:00 UTC), spread across Aug 16 to Aug 20.
 *  3. Sets a real TMDB backdrop as each new post's feature image.
 * Safe to re-run: new posts are never overwritten if the slug exists.
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

/* ------------------------------------------------------------------ */
/* 1. Cocktail 2 is OUT: update the tracker to "now streaming".        */
/* ------------------------------------------------------------------ */
const COCKTAIL_UPDATE = {
  title: 'Cocktail 2 OTT Release: Now Streaming on Netflix',
  meta_title: 'Cocktail 2 Now Streaming on Netflix: How to Watch',
  meta_description: 'Cocktail 2 is now streaming on Netflix from August 14, 2026. How to watch Shahid Kapoor and Kriti Sanon’s romance online, languages, plans and more.',
  excerpt: 'The wait is over. Cocktail 2 premiered on Netflix on August 14, 2026. Here is how to watch it tonight, which languages it streams in, and what you need.',
  body: [
    'Update: the wait is over. Cocktail 2 is now streaming on Netflix worldwide, with the digital premiere going live on August 14, 2026. If you have been holding out for the couch version, tonight is the night.',
    'How to watch Cocktail 2 online: open Netflix, search Cocktail 2, and press play. The film is included with every Netflix plan, from the mobile plan upward, with no extra rental fee. It streams in Hindi with subtitles, and dubbed audio tracks are available in several languages depending on your region.',
    'The sequel brings back the spirit of the 2012 favorite with Shahid Kapoor, Kriti Sanon and Rashmika Mandanna in the lead. The soundtrack and the chemistry between the leads carried its theatrical run, and this is exactly the kind of breezy romance that plays even better at home.',
    'Not sure it is your kind of film? The trailer, ratings and full cast details are on the Cocktail 2 page here on CineTonight, and the Where to Watch panel shows live availability for the country you are browsing from.',
    'Frequently asked questions',
    'Is Cocktail 2 on Netflix now?',
    'Yes. Cocktail 2 has been streaming on Netflix since August 14, 2026, in all regions where Netflix operates.',
    'Do I need a special Netflix plan to watch Cocktail 2?',
    'No. Any active Netflix plan includes it, from mobile to premium.',
    'Is Cocktail 2 available in Hindi?',
    'Yes, it streams in Hindi with subtitles, and dubbed tracks in other languages are being added by region.',
  ],
};

/* ------------------------------------------------------------------ */
/* 2. New scheduled trackers. 04:00 UTC = 9 AM Pakistan, 9:30 AM India */
/* ------------------------------------------------------------------ */
const POSTS = [
  {
    slug: 'lanterns-ott-release-date-jiohotstar',
    publish_at: '2026-08-16T04:00:00Z', date_label: '16 Aug 2026',
    title: 'Lanterns OTT Release Date: DC’s Green Lantern Series Hits JioHotstar Aug 17',
    cat: 'News',
    meta_title: 'Lanterns OTT Release Date: JioHotstar From Aug 17',
    meta_description: 'Lanterns, the DC Green Lantern series, streams on JioHotstar in India from August 17, 2026. Release date, where to watch, cast and what to expect.',
    excerpt: 'DC’s Green Lantern series Lanterns arrives on JioHotstar in India on August 17, 2026. Here is where to watch it, who is in it, and why it is one of the year’s biggest superhero shows.',
    body: [
      'Lanterns, the DC series built around the Green Lantern corps, streams in India on JioHotstar from August 17, 2026. If you have been waiting for a serious, grounded take on one of DC’s biggest heroes, this is the one to circle on your calendar.',
      'The short answer for Indian viewers: JioHotstar carries the series as part of its HBO lineup, included with a standard subscription from the mobile plan upward. Episodes stream in English with subtitles, and dubbed audio options typically follow for major titles.',
      'The series stars Kyle Chandler as Hal Jordan alongside Aaron Pierre as John Stewart, pairing a veteran Lantern with a new recruit in a slow burn mystery that critics have compared to True Detective in tone. It is a detective story first and a superhero story second, which is exactly why it has pulled in viewers who normally skip capes entirely.',
      'If you are outside India, availability differs by region since HBO content travels under different platforms around the world. Open the show’s page on CineTonight and the Where to Watch panel shows live options for the country you are browsing from.',
      'Frequently asked questions',
      'When does Lanterns release on OTT in India?',
      'August 17, 2026 on JioHotstar, as part of its HBO catalogue.',
      'Do I need a special plan to watch Lanterns on JioHotstar?',
      'No. Any active JioHotstar plan includes it.',
      'Is Lanterns connected to the DC movies?',
      'It is part of the new unified DC universe, so events here are expected to matter in upcoming DC films.',
    ],
    tmdb: { kind: 'tv', query: 'Lanterns' },
  },
  {
    slug: 'outer-banks-season-5-release-date-netflix',
    publish_at: '2026-08-17T04:00:00Z', date_label: '17 Aug 2026',
    title: 'Outer Banks Season 5 Release Date: The Final Season Streams Aug 20 on Netflix',
    cat: 'News',
    meta_title: 'Outer Banks Season 5: Netflix Release Date Aug 20',
    meta_description: 'Outer Banks Season 5 premieres on Netflix on August 20, 2026. The final season’s release date, time, what to expect and how the Pogues’ story ends.',
    excerpt: 'The Pogues ride one last time. Outer Banks Season 5, the final season, hits Netflix on August 20, 2026. Here is everything to know before the finale drops.',
    body: [
      'Outer Banks Season 5 premieres on Netflix on August 20, 2026, and this one is the end of the road: Netflix has confirmed it as the final season of the treasure hunting saga. The Pogues get one last adventure, and every storyline from the past four seasons is heading toward a close.',
      'The essentials: the new season streams on Netflix worldwide and is included with every plan. New seasons typically go live at 12:30 PM India time on release day, so an evening watch party on the 20th is safe to plan.',
      'Season 4 ended on one of the show’s most brutal cliffhangers, and the final season picks up the fallout directly. Expect the usual mix of treasure maps, near drownings and questionable decisions, but with the emotional weight of a farewell. Netflix final seasons tend to go big, and early teasers suggest this one is no exception.',
      'If you need a refresher before the finale, all four earlier seasons are streaming on Netflix now, and the show’s page here on CineTonight has the trailer, ratings and cast details, plus live availability for your country in the Where to Watch panel.',
      'Frequently asked questions',
      'When does Outer Banks Season 5 release on Netflix?',
      'August 20, 2026, worldwide. In India, Netflix originals usually unlock at 12:30 PM.',
      'Is Season 5 the last season of Outer Banks?',
      'Yes. Netflix has confirmed Season 5 is the final season.',
      'Do I need to rewatch before Season 5?',
      'A recap of the Season 4 finale is enough. The new season continues directly from that cliffhanger.',
    ],
    tmdb: { kind: 'tv', query: 'Outer Banks' },
  },
  {
    slug: 'welcome-to-the-jungle-ott-release-date',
    publish_at: '2026-08-18T04:00:00Z', date_label: '18 Aug 2026',
    title: 'Welcome to the Jungle OTT Release Date: Akshay Kumar’s Comedy Streams Aug 21',
    cat: 'News',
    meta_title: 'Welcome to the Jungle OTT Release: JioHotstar Aug 21',
    meta_description: 'Welcome to the Jungle, the third Welcome film with Akshay Kumar, streams on JioHotstar from August 21, 2026. OTT release date, cast and how to watch.',
    excerpt: 'The Welcome franchise returns. Welcome to the Jungle, with Akshay Kumar leading a massive ensemble, arrives on JioHotstar on August 21, 2026. Here is everything to know.',
    body: [
      'Welcome to the Jungle, the long awaited third film in the beloved Welcome comedy franchise, makes its digital premiere on JioHotstar on August 21, 2026. If you missed the madness in theatres, the couch version is days away.',
      'The short answer: JioHotstar holds the streaming rights in India, and the film is included with any subscription tier, from mobile upward, with no separate rental. It streams in Hindi, and the platform typically adds subtitle options at launch.',
      'This is one of the biggest ensemble casts Bollywood has assembled in years: Akshay Kumar and Suniel Shetty lead a lineup that runs deeper than most award shows, with Disha Patani among the many familiar faces. The Welcome films built their reputation on gloriously silly gangster comedy, and the third entry leans all the way into that legacy.',
      'Comedies like this one are made for family streaming nights, and the Welcome brand still pulls enormous nostalgia in India and Pakistan. Expect it to sit in JioHotstar’s top charts for weeks.',
      'The trailer, ratings and full cast are on the film’s page here on CineTonight, and the Where to Watch panel shows live availability for your country the moment it goes live.',
      'Frequently asked questions',
      'When does Welcome to the Jungle release on OTT?',
      'August 21, 2026 on JioHotstar in India.',
      'Is Welcome to the Jungle a sequel to Welcome and Welcome Back?',
      'Yes, it is the third film in the Welcome comedy franchise, with several returning favorites and many new faces.',
      'Do I need a premium plan to watch it?',
      'No. Any active JioHotstar plan includes it.',
    ],
    tmdb: { kind: 'movie', query: 'Welcome to the Jungle', year: 2026 },
  },
  {
    slug: 'rangbaaz-season-4-release-date-zee5',
    publish_at: '2026-08-19T04:00:00Z', date_label: '19 Aug 2026',
    title: 'Rangbaaz Season 4 Release Date: What We Know About the ZEE5 Crime Drama',
    cat: 'News',
    meta_title: 'Rangbaaz Season 4 Release Date: ZEE5 Latest Updates',
    meta_description: 'Rangbaaz Season 4 is officially announced at ZEE5 with Mohit Raina in the lead. Release date updates, cast news and what to expect, tracked live.',
    excerpt: 'ZEE5 has officially announced Rangbaaz Season 4 with Mohit Raina leading a new true crime story. Here is everything we know, updated as the release date is confirmed.',
    body: [
      'Rangbaaz is coming back. ZEE5 has officially announced Season 4 of its acclaimed crime anthology, with Mohit Raina stepping into the lead for a new story. The exact release date has not been announced yet, and this page is updated the moment it is.',
      'The short answer: Season 4 will stream on ZEE5, like every previous season. Based on how the platform has rolled out earlier seasons, expect roughly a month between the date announcement and the premiere, with a trailer landing in between.',
      'Each Rangbaaz season tells a self contained story inspired by a real Indian gangster, which means you can start with Season 4 without watching the earlier ones. That said, the first three seasons, including the widely praised Rangbaaz: The Bihar Chapter, are streaming on ZEE5 now and make for an excellent catch up.',
      'Mohit Raina describes the new season as a gritty, layered and deeply human story, which fits the franchise’s reputation: these are crime dramas about how ordinary men become infamous, not glorification pieces. The anthology has quietly become one of ZEE5’s strongest brands.',
      'Bookmark this page: the confirmed date, trailer and cast details will appear here as soon as ZEE5 makes them official.',
      'Frequently asked questions',
      'When is Rangbaaz Season 4 releasing?',
      'ZEE5 has announced the season but not the date yet. This page updates as soon as the date is official.',
      'Who stars in Rangbaaz Season 4?',
      'Mohit Raina leads the new season. Full cast details are yet to be announced.',
      'Do I need to watch the earlier seasons first?',
      'No. Every Rangbaaz season is a self contained true crime story.',
    ],
    tmdb: { kind: 'tv', query: 'Rangbaaz' },
  },
  {
    slug: 'bandar-ott-release-date',
    publish_at: '2026-08-20T04:00:00Z', date_label: '20 Aug 2026',
    title: 'Bandar OTT Release Date: Where Bobby Deol’s Film Will Stream',
    cat: 'News',
    meta_title: 'Bandar OTT Release Date: Platform and Latest Updates',
    meta_description: 'Bandar, starring Bobby Deol, is heading to OTT with ZEE5 reportedly holding streaming rights. Release date updates and where to watch, tracked live.',
    excerpt: 'Bobby Deol’s Bandar is headed for its digital premiere, with reports pointing to ZEE5. Here is what we know about its OTT release date, updated as it is confirmed.',
    body: [
      'Bandar, the gritty Bobby Deol starrer that first turned heads on the festival circuit, is on its way to streaming. Reports indicate ZEE5 has picked up the digital rights, though the platform has not made an official announcement yet. This page tracks the release and is updated the moment anything is confirmed.',
      'The short answer: expect Bandar on ZEE5, with an official date announcement likely a couple of weeks before the premiere. Until the platform confirms, treat the date as open, and check back here for the update.',
      'The film premiered to strong word of mouth at international festivals, with Bobby Deol’s performance drawing particular praise in the latest chapter of one of Bollywood’s most interesting late career reinventions. It is a darker, more intense film than a typical star vehicle, which is exactly why its streaming release is so anticipated.',
      'While you wait, the film’s page here on CineTonight has the available details, and the Where to Watch panel will show live availability the day it lands on a platform.',
      'Frequently asked questions',
      'When is Bandar releasing on OTT?',
      'The date is not officially announced. Reports point to ZEE5, and this page updates as soon as it is confirmed.',
      'Which platform will stream Bandar?',
      'ZEE5 is reported to hold the streaming rights. An official confirmation is awaited.',
      'Why is Bandar getting so much attention?',
      'It premiered at international film festivals with strong word of mouth, especially for Bobby Deol’s lead performance.',
    ],
    tmdb: { kind: 'movie', query: 'Bandar' },
  },
];

/* ------------------------------------------------------------------ */
async function tmdbBackdrop({ kind, query, year }) {
  const q = new URLSearchParams({ api_key: tmdbKey, query, ...(year ? { year: String(year) } : {}) });
  const res = await fetch(`https://api.themoviedb.org/3/search/${kind}?${q}`);
  const data = await res.json();
  const hit = (data.results ?? []).find((r) => r.backdrop_path) ?? (data.results ?? [])[0];
  if (!hit) return null;
  return hit.backdrop_path ? `https://image.tmdb.org/t/p/w1280${hit.backdrop_path}`
    : hit.poster_path ? `https://image.tmdb.org/t/p/w780${hit.poster_path}` : null;
}

/* 1. Cocktail 2 update */
{
  const { error } = await sb.from('blog_posts').update({
    ...COCKTAIL_UPDATE,
    status: 'published',
    publish_at: null,
    date_label: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  }).eq('slug', 'cocktail-2-ott-release-date');
  console.log(error ? `FAIL cocktail update: ${error.message}` : 'updated + published: cocktail-2-ott-release-date (now streaming)');
}

/* 2 + 3. New scheduled posts with images */
for (const p of POSTS) {
  const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', p.slug).maybeSingle();
  if (existing) { console.log('skip (exists):', p.slug); continue; }
  const image_url = await tmdbBackdrop(p.tmdb).catch(() => null);
  const { error } = await sb.from('blog_posts').insert({
    slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt, body: p.body,
    meta_title: p.meta_title, meta_description: p.meta_description,
    date_label: p.date_label, read_label: '4 min', status: 'scheduled',
    publish_at: p.publish_at, ...(image_url ? { image_url } : {}),
  });
  console.log(error ? `FAIL ${p.slug}: ${error.message}` : `scheduled ${p.slug} for ${p.publish_at}${image_url ? ' (image set)' : ' (NO IMAGE FOUND, add one in dashboard)'}`);
}
console.log('Done. Check Dashboard -> Blog: verify each image matches the right title before the mornings they go live.');
