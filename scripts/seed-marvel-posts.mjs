#!/usr/bin/env node
/**
 * Marvel content push, and cleanup of the old scheduled batch.
 * Run once from the project root:  node scripts/seed-marvel-posts.mjs
 *
 * 1. DELETES the five scheduled tracker posts from batch 2 (still unpublished).
 * 2. Publishes the Spider-Man: Brand New Day OTT tracker immediately
 *    (the hottest OTT query in India right now).
 * 3. Schedules the Avengers: Doomsday India hub for tomorrow 9 AM PKT.
 * 4. Schedules the "What to Watch Before Doomsday" guide the day after.
 * Safe to re-run: inserts skip slugs that already exist.
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

/* -- 1. remove the old scheduled batch (only if still unpublished) -------- */
const REMOVE = [
  'lanterns-ott-release-date-jiohotstar',
  'outer-banks-season-5-release-date-netflix',
  'welcome-to-the-jungle-ott-release-date',
  'rangbaaz-season-4-release-date-zee5',
  'bandar-ott-release-date',
];
for (const slug of REMOVE) {
  const { data: row } = await sb.from('blog_posts').select('id,status').eq('slug', slug).maybeSingle();
  if (!row) { console.log('already gone:', slug); continue; }
  if (row.status === 'published') { console.log('SKIP delete (already published, remove by hand if you want):', slug); continue; }
  const { error } = await sb.from('blog_posts').delete().eq('slug', slug);
  console.log(error ? `FAIL delete ${slug}: ${error.message}` : `deleted scheduled post: ${slug}`);
}

/* -- 2 + 3 + 4. the Marvel three ------------------------------------------ */
const todayLabel = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const POSTS = [
  {
    slug: 'spider-man-brand-new-day-ott-release-date',
    status: 'published', publish_at: null, date_label: todayLabel, read_label: '5 min',
    title: 'Spider-Man Brand New Day OTT Release Date: When and Where It Will Stream',
    cat: 'News',
    meta_title: 'Spider-Man Brand New Day OTT Release Date: Update',
    meta_description: 'Spider-Man Brand New Day OTT release date, latest update: Netflix has reportedly bagged streaming rights, with a late September or October window expected. Details here.',
    excerpt: 'Tom Holland’s biggest Spider-Man film yet is smashing records in theatres, and everyone is asking the same question: when does it hit OTT? Here is the latest, updated as it is confirmed.',
    body: [
      'Spider-Man: Brand New Day opened in theatres on July 31, 2026 and immediately did what Spider-Man films do: broke records. In India alone it opened above 14 crore, and with Tom Holland and Zendaya back under Destin Daniel Cretton’s direction, the theatrical run is still going strong. Which brings up the question this page exists to answer: when can you watch it at home?',
      'The short answer, as of today: no official OTT date has been announced, but Netflix has reportedly acquired the streaming rights, and industry reporting points to a digital release window of late September to October 2026. Sony’s biggest films typically hold a longer theatrical window than average, and this one is earning too much in cinemas to rush. We update this page the moment anything is official.',
      'What that means in practice for viewers in India and Pakistan: expect the film on Netflix first among subscription platforms, in English with subtitles plus the Hindi dub that played in cinemas. Before that, a digital purchase or rental release usually arrives a few weeks ahead of streaming for those who cannot wait.',
      'Why the wait is longer than usual: Brand New Day is not a victory lap. It resets Peter Parker after the events of No Way Home, with a street level story that critics have called the most grounded Spider-Man film of the Holland era. Sony knows films like this hold in theatres for months, and streaming dates follow the box office, not the calendar.',
      'While you wait, the trailer, ratings and cast details are on the film’s page here on CineTonight, and the Where to Watch panel will show live availability in your country the moment any platform lists it. Bookmark this post: when the date drops, it appears here first.',
      'Frequently asked questions',
      'When is Spider-Man Brand New Day releasing on OTT?',
      'No official date yet. Reports point to late September or October 2026, roughly eight to ten weeks after its July 31 theatrical release. This page updates as soon as it is confirmed.',
      'Which OTT platform will stream Spider-Man Brand New Day?',
      'Netflix has reportedly acquired the streaming rights. An official platform announcement is still awaited.',
      'Will Spider-Man Brand New Day be available in Hindi on OTT?',
      'Yes, that is fully expected: the Hindi dub ran in Indian cinemas and Sony’s Spider-Man films have always streamed with their dubbed audio tracks.',
      'Is Spider-Man Brand New Day still in theatres?',
      'Yes, it is running in cinemas now, and that is currently the only legal way to watch it.',
    ],
    tmdb: { kind: 'movie', query: 'Spider-Man Brand New Day' },
  },
  {
    slug: 'avengers-doomsday-release-date-india',
    status: 'scheduled', publish_at: '2026-08-17T04:00:00Z', date_label: '17 Aug 2026', read_label: '6 min',
    title: 'Avengers Doomsday Release Date in India: Cast, Trailer and Everything We Know',
    cat: 'News',
    meta_title: 'Avengers Doomsday Release Date India: Cast, Trailer',
    meta_description: 'Avengers Doomsday releases December 18, 2026 in India and worldwide. Robert Downey Jr is Doctor Doom. Full confirmed cast, trailer breakdown and latest updates.',
    excerpt: 'Robert Downey Jr returns to Marvel as Doctor Doom, and the Avengers face the X-Men era head on. Release date, the massive confirmed cast, and what the trailer reveals, all in one place.',
    body: [
      'Avengers: Doomsday releases in cinemas on December 18, 2026, in India and worldwide, and it is already shaping up as the biggest film event since Endgame. The reason sits right at the top of the poster: Robert Downey Jr is back in the Marvel universe, not as Iron Man, but as its new villain, Doctor Doom. This page is your single tracker for the release date, cast and every official update between now and December.',
      'The essentials first. The film is directed by Joe and Anthony Russo, the pair behind Infinity War and Endgame, with Stephen McFeely writing. The first full trailer premiered in July and advance ticket sales have already opened in several markets, months ahead of release, something studios only do when they expect a stampede.',
      'The confirmed cast is the largest Marvel has ever assembled. Alongside Downey’s Doom: Chris Hemsworth as Thor, Anthony Mackie as Captain America, Tom Hiddleston as Loki, Florence Pugh as Yelena, Sebastian Stan, Paul Rudd, Simu Liu, Letitia Wright and Winston Duke. The new Fantastic Four, Pedro Pascal, Vanessa Kirby, Ebon Moss-Bachrach and Joseph Quinn, walk straight in from First Steps. And the headline shock: the original X-Men are here, with Patrick Stewart, Ian McKellen, Kelsey Grammer, James Marsden, Rebecca Romijn and Alan Cumming returning, plus Channing Tatum’s Gambit.',
      'What the trailer tells us: Doom speaks with a Latverian accent, refers to an unthinkable decision, and commands an army of Sentinels, the mutant hunting machines X-Men fans know all too well. The film sets up Doom discovering the multiverse and eyeing other realities to rule, leading directly into Avengers: Secret Wars.',
      'For viewers in India and Pakistan: expect the usual Marvel rollout, English plus Hindi, Tamil and Telugu dubs in cinemas, with IMAX bookings opening closer to release. The OTT release will follow the theatrical run months later, and once it is announced, we will track it the way we track every big premiere.',
      'Between now and December this page updates with every trailer, booking date and confirmation. For what to watch first, our guide to the essential films before Doomsday goes up right after this one.',
      'Frequently asked questions',
      'When does Avengers Doomsday release in India?',
      'December 18, 2026, same day as the worldwide release.',
      'Is Robert Downey Jr really playing Doctor Doom?',
      'Yes. Marvel confirmed it on stage in 2024, and the trailer shows him fully in character, Latverian accent included.',
      'Are the X-Men in Avengers Doomsday?',
      'Yes. Patrick Stewart, Ian McKellen, Kelsey Grammer, James Marsden, Rebecca Romijn and Alan Cumming are all confirmed, and the trailer shows an army of Sentinels.',
      'When will Avengers Doomsday come to OTT?',
      'Months after the theatrical run, on the platform Marvel films stream on in your region. We will publish a dedicated tracker once anything is official.',
    ],
    tmdb: { kind: 'movie', query: 'Avengers Doomsday' },
  },
  {
    slug: 'what-to-watch-before-avengers-doomsday',
    status: 'scheduled', publish_at: '2026-08-18T04:00:00Z', date_label: '18 Aug 2026', read_label: '7 min',
    title: 'What to Watch Before Avengers Doomsday: The 10 Essentials',
    cat: 'Guides',
    meta_title: 'What to Watch Before Avengers Doomsday: 10 Essentials',
    meta_description: 'Skip the 35 film rewatch. These 10 movies and shows are all you need before Avengers Doomsday, with why each one matters and where to check streaming availability.',
    excerpt: 'You do not need to rewatch 35 films before December. These ten movies and shows cover every character and plot thread Doomsday builds on, and nothing you can safely skip.',
    body: [
      'Avengers: Doomsday lands December 18 with the biggest cast Marvel has ever put in one film: Avengers, the Fantastic Four, the original X-Men and Robert Downey Jr as Doctor Doom. Nobody has time to rewatch 35 films first. The good news: you do not need to. These ten cover every thread Doomsday pulls on, in the order we would watch them. Every title here has its own page on CineTonight, where the Where to Watch panel shows live streaming availability for your country.',
      '1. Avengers: Endgame. The face of Doctor Doom belongs to the man who died saving this universe. Knowing exactly what Tony Stark means to these characters is the whole emotional engine of Doomsday, and this is where that story closed.',
      '2. Loki, both seasons. The multiverse rulebook. Doomsday is a multiverse story, and this series is where Marvel actually explains how branching realities work, plus Tom Hiddleston walks straight from its finale into this film.',
      '3. Deadpool and Wolverine. The bridge that carried mutants into Marvel’s main universe, and the film that taught general audiences what happens when a reality dies. Both ideas sit at the heart of Doomsday.',
      '4. The Fantastic Four: First Steps. Pedro Pascal’s team joins Doomsday directly from this film, and in the comics no hero matters more to Doom’s story than Reed Richards. Consider this one mandatory.',
      '5. Thunderbolts. The team the trailer calls the New Avengers: Yelena, Sentry, Red Guardian, US Agent and Ghost are all confirmed for Doomsday, and this film is where they became a unit.',
      '6. Captain America: Brave New World. Sam Wilson carrying the shield into the biggest fight of his life starts making sense here, along with where world governments stand on heroes.',
      '7. X-Men and X2. The two films that made Patrick Stewart and Ian McKellen the definitive Professor X and Magneto. Those exact versions return in Doomsday, twenty five years on.',
      '8. X-Men: Days of Future Past. The Sentinels filling Doomsday’s trailer are this film’s nightmare made real, and it is still the best X-Men film ever made.',
      '9. Black Panther: Wakanda Forever. Shuri, M’Baku and Wakanda’s place in world politics all feed into Doomsday, with Letitia Wright and Winston Duke both confirmed.',
      '10. Shang-Chi and the Legend of the Ten Rings. Simu Liu is on the Doomsday cast list, and the ten rings mystery is one of the loose threads the next two Avengers films are expected to pick up.',
      'Watching order if you only have one weekend: Endgame, Deadpool and Wolverine, First Steps, Thunderbolts, Days of Future Past. That is the five film core. Add the rest as December gets closer.',
      'Where to stream them: most Marvel Studios titles stream in one place in your country, while the X-Men films move between platforms more often. Rather than listing platforms that may be outdated next month, open any title’s page here on CineTonight: the Where to Watch panel checks live availability for the country you are browsing from.',
      'Frequently asked questions',
      'Do I need to watch all the Marvel movies before Avengers Doomsday?',
      'No. The ten titles above cover every character and plot thread the film builds on. The five film core is Endgame, Deadpool and Wolverine, First Steps, Thunderbolts and Days of Future Past.',
      'Do I need to watch the old X-Men movies before Doomsday?',
      'The original trilogy era matters most: X-Men, X2 and Days of Future Past introduce the exact actors and the Sentinels returning in Doomsday.',
      'Is WandaVision or Doctor Strange 2 required for Doomsday?',
      'Helpful for multiverse background, but not essential: Loki covers the rules Doomsday actually uses. Watch them only if you have extra time.',
    ],
    tmdb: { kind: 'movie', query: 'Avengers Doomsday', fallback: { kind: 'movie', query: 'Avengers Endgame' } },
  },
];

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

for (const p of POSTS) {
  const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', p.slug).maybeSingle();
  if (existing) { console.log('skip (exists):', p.slug); continue; }
  const image_url = await tmdbBackdrop(p.tmdb).catch(() => null);
  const { error } = await sb.from('blog_posts').insert({
    slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt, body: p.body,
    meta_title: p.meta_title, meta_description: p.meta_description,
    date_label: p.date_label, read_label: p.read_label, status: p.status,
    publish_at: p.publish_at, ...(image_url ? { image_url } : {}),
  });
  console.log(error ? `FAIL ${p.slug}: ${error.message}`
    : `${p.status === 'published' ? 'PUBLISHED' : `scheduled for ${p.publish_at}`}: ${p.slug}${image_url ? ' (image set)' : ' (NO IMAGE FOUND, add one in dashboard)'}`);
}
console.log('Done. Check Dashboard -> Blog: verify each image matches (Doomsday may have limited art on TMDB until closer to release).');
