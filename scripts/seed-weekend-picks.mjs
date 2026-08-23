#!/usr/bin/env node
/**
 * "What to Watch This Weekend" (Aug 21–23, 2026) — scheduled for
 * 21 Aug, 9 AM PKT (04:00 UTC), the morning the weekend window opens.
 * Run once from the project root:  node scripts/seed-weekend-picks.mjs
 *
 * "## " lines render as H2, "### " as H3 (app/blog/[slug]/page.tsx).
 * No TMDB image is auto-attached — this post gets a custom generated
 * featured image, added via the dashboard Media Library.
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
if (!url || !key) { console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const POST = {
  slug: 'what-to-watch-this-weekend-august-21-23-2026',
  status: 'scheduled',
  publish_at: '2026-08-21T04:00:00Z', // 9 AM PKT, Friday of the covered weekend
  date_label: '21 Aug 2026',
  read_label: '9 min',
  cat: 'Streaming',
  title: 'What to Watch This Weekend: 10 Best Movies & Shows for August 21–23, 2026',
  meta_title: 'What to Watch This Weekend: 10 Best Movies & Shows 2026',
  meta_description: 'Not sure what to watch this weekend? Here are the best new movies and shows for August 21–23, 2026, across Netflix, HBO Max, Prime Video, Disney+ and Hulu.',
  excerpt: 'The weekend of August 21–23, 2026 is unusually strong: Outer Banks ends on Netflix, A24’s Mother Mary hits HBO Max, and there are great picks from India and Korea too. Here are 10 titles worth your weekend, by mood.',
  body: [
    'Another weekend, another half hour spent scrolling through streaming apps trying to decide what to watch.',
    'If that sounds familiar, we’ve done the searching for you.',
    'The weekend of August 21–23, 2026 is unusually strong. Netflix is saying goodbye to one of its biggest young-adult hits, HBO Max has a major new A24 movie and a fresh DC series, Prime Video has an intimate look at one of tennis’ greatest players, and there are good options from India and Korea too.',
    'Here are 10 movies and shows worth putting on your watchlist this weekend, depending on the mood you’re in.',
    'Streaming availability can differ by country, so check your local provider before watching.',
    '## 1. Outer Banks Season 5',
    'Where to watch: Netflix · Best for: Adventure, mystery and a proper weekend binge',
    'If you’ve been following the Pogues since the beginning, this is probably the easiest recommendation on the list.',
    'Outer Banks returns for its fifth and final season on August 20, bringing the treasure-hunting adventure to an end after five seasons. The story picks up after the devastating events in Morocco, with John B, Sarah, Kiara, Pope and Cleo looking for both justice and a way forward.',
    'Netflix has confirmed that the final season contains 10 episodes, so there is enough here to take over most of your weekend if you want it to.',
    'You probably shouldn’t start with Season 5 if you’ve never watched the show before, but for existing fans this is the main streaming event of the weekend.',
    'Watch it if: you want high-stakes adventure, friendship, romance and one final Pogues treasure hunt.',
    '## 2. Mother Mary',
    'Where to watch: HBO Max · Best for: Psychological drama and something darker',
    'For something much stranger than the usual Friday-night blockbuster, try Mother Mary.',
    'The A24 psychological drama arrives on HBO Max on August 21 and stars Anne Hathaway and Michaela Coel. The story centers on a famous musician reconnecting with an estranged friend ahead of an important performance, but the relationship quickly moves into much more uncomfortable emotional territory.',
    'Warner Bros. Discovery lists the film among HBO Max’s major August 21 arrivals.',
    'This isn’t the obvious choice if you simply want something light playing in the background. It looks better suited to viewers who want a movie that gives them something to talk about afterwards.',
    'Watch it if: you’re in the mood for an intense, stylish adult drama rather than another franchise movie.',
    '## 3. Pyaar Prema Kalyanam',
    'Where to watch: Netflix · Best for: Romance, comedy and family viewing',
    'One of this weekend’s more interesting international releases comes from India.',
    'Pyaar Prema Kalyanam premieres on Netflix on August 21. The Tamil romantic family comedy follows Pavi, an influencer who doesn’t want to leave her family home after getting married. Instead, her husband moves in with her family.',
    'Naturally, that simple decision creates plenty of awkward encounters, family arguments and culture clashes.',
    'Netflix describes the film as a modern family entertainer that plays with traditional expectations around marriage while keeping the story rooted in romance and comedy.',
    'It’s also exactly the kind of title that can get lost when streaming homepages lean too heavily toward English-language releases.',
    'Watch it if: you want something warm, funny and relationship-focused this weekend.',
    '## 4. Lanterns',
    'Where to watch: HBO Max · Best for: Crime mystery with a superhero edge',
    'You don’t need another recommendation for a generic superhero show.',
    'Fortunately, Lanterns doesn’t appear to be trying to become one.',
    'The new DC series stars Aaron Pierre as John Stewart and Kyle Chandler as Hal Jordan, following the two Green Lanterns as they investigate a dark mystery on Earth.',
    'The first episode arrived on August 16, and the next episode is scheduled for Sunday, August 23, making this a good weekend to get on board early.',
    'Early reactions have focused heavily on the chemistry between Pierre and Chandler and the show’s decision to treat the story more like a grounded detective mystery than a constant CGI spectacle.',
    'Watch it if: you like crime dramas but wouldn’t mind some DC mythology mixed in.',
    '## 5. LION',
    'Where to watch: Disney+ and Hulu · Best for: Family viewing, nature lovers and a quieter night',
    'Not everything on a weekend watchlist needs murders, superheroes or cliffhangers.',
    'LION follows a real lion cub named Kio as he grows from a vulnerable young animal into adulthood in Kenya’s Maasai Mara.',
    'The project comes from Jon Favreau and BBC Studios executive producer Mike Gunton and was filmed over four years. Disney describes it as a coming-of-age story built around Kio’s struggle to survive loss, exile and rival animals.',
    'All episodes began streaming on August 20.',
    'The result should work especially well for a family evening or for anyone tired of fictional drama and looking for something genuinely spectacular to watch.',
    'Watch it if: you want beautiful nature filmmaking without committing to another complicated drama.',
    '## 6. Novak Djokovic: The Wolf in Winter',
    'Where to watch: Prime Video · Best for: Sports fans and documentary viewers',
    'Even if you don’t follow tennis closely, Novak Djokovic: The Wolf in Winter has the ingredients of a fascinating sports documentary.',
    'Directed by Jason Hehir, who also directed The Last Dance, the film looks beyond Djokovic’s records and trophies to examine the competitiveness, controversy, family life and mentality behind his career.',
    'Amazon says the documentary includes behind-the-scenes access and interviews with Djokovic, his family and major tennis figures including Rafael Nadal, Andre Agassi, Pete Sampras and Boris Becker. It premiered worldwide on Prime Video on August 20.',
    'The most interesting sports documentaries are rarely just about the sport itself. They’re about obsession, pressure and what happens when winning becomes part of someone’s identity. This looks firmly in that category.',
    'Watch it if: you enjoyed The Last Dance or like character-driven sports documentaries.',
    '## 7. Flex X Cop Season 2',
    'Where to watch: Disney+ / Hulu in supported regions · Best for: Korean crime comedy',
    'If you want a Korean series this weekend, Flex X Cop Season 2 is worth a look.',
    'The new season brings Isoo back after police-academy training, only for him to discover that his former instructor is now leading the violent-crimes team — and the two are expected to work together.',
    'Disney’s August schedule has new episodes arriving on both August 21 and August 22.',
    'The combination of crime investigation, clashing personalities and comedy gives it a different rhythm from the darker thrillers that dominate streaming.',
    'Watch it if: you want a Korean series with crime, humour and an odd-couple partnership.',
    '## 8. Conan O’Brien Must Go Season 3',
    'Where to watch: HBO Max · Best for: Comedy and something easy to watch',
    'Maybe you don’t want a 10-hour mystery this weekend.',
    'In that case, Conan O’Brien Must Go is back.',
    'Season 3 begins on HBO Max on August 21, with Conan travelling to different places, meeting people and doing what he does best: turning seemingly normal situations into something ridiculous.',
    'HBO says the third season contains four episodes released weekly.',
    'It’s a useful option to have on this list because not every Friday night needs a giant plot to follow.',
    'Watch it if: you want to laugh and don’t want to pay close attention to a complicated story.',
    '## 9. The Shards',
    'Where to watch: Hulu · Best for: Dark mystery, horror and ’80s atmosphere',
    'If your ideal weekend viewing is unsettling rather than relaxing, The Shards deserves a look.',
    'Based on Bret Easton Ellis’ novel and produced by Ryan Murphy, the series follows teenagers in 1980s Los Angeles against the backdrop of a serial-killer mystery.',
    'The show is already several episodes into its run, which makes this a better recommendation for viewers willing to catch up rather than someone looking for a standalone Friday-night movie. New episodes continue into September.',
    'Its mix of glossy ’80s nostalgia and much darker material gives it a fairly distinctive identity.',
    'Watch it if: you want something stylish, strange and increasingly sinister.',
    '## 10. Camp Rock 3',
    'Where to watch: Disney+ · Best for: Nostalgia and family movie night',
    'Sometimes the correct weekend choice is simply something fun.',
    'Camp Rock 3 arrived on Disney+ on August 14 and brings Kevin, Joe and Nick Jonas back as Connect 3. This time, the band returns to Camp Rock to search for a new opening act for its reunion tour, creating a new competition among the campers.',
    'It isn’t trying to reinvent the musical. That’s part of the appeal.',
    'For adults who watched the originals, there’s a large dose of nostalgia. For younger viewers, it works as a straightforward music-filled Disney movie.',
    'Watch it if: you need an easy family pick or still remember the words to the original Camp Rock songs.',
    '## What Should You Watch This Weekend?',
    'Still can’t choose? Here’s the quick version.',
    'For a big binge: Outer Banks Season 5. For a movie night: Mother Mary. For romance and comedy: Pyaar Prema Kalyanam. For superheroes: Lanterns. For family viewing: LION. For sports: Novak Djokovic: The Wolf in Winter. For Korean drama: Flex X Cop. For comedy: Conan O’Brien Must Go. For something dark: The Shards. For nostalgia: Camp Rock 3.',
    'The best choice isn’t necessarily the biggest release. Pick the one that matches the kind of night you’re actually having.',
    'That’s the whole point.',
    '## What to Watch on Netflix This Weekend',
    'The strongest Netflix choice is Outer Banks Season 5, particularly for existing fans who want to see how the Pogues’ story ends.',
    'For something considerably lighter, Pyaar Prema Kalyanam gives Netflix viewers a new Tamil romantic comedy arriving right as the weekend begins. Both are available from August 20–21.',
    '## What to Watch on HBO Max This Weekend',
    'HBO Max probably has the strongest variety this weekend.',
    'Mother Mary arrives Friday for movie viewers, Conan O’Brien Must Go returns for comedy fans, while Lanterns gives anyone looking for a longer weekly series something new to follow.',
    '## What to Watch on Prime Video This Weekend',
    'Our standout new Prime Video recommendation is Novak Djokovic: The Wolf in Winter.',
    'It premiered globally on August 20 and should appeal well beyond serious tennis fans thanks to its focus on Djokovic’s personality, family, career and competitive mentality.',
    '## What to Watch on Disney+ This Weekend',
    'For something relaxing, start with LION.',
    'K-drama viewers can check out new Flex X Cop Season 2 episodes, while families looking for something lighter have both Camp Rock 3 and the new LEGO Disney Princess: Magical Mayhem, which premieres August 21.',
    '## Frequently Asked Questions',
    '### What are the best new shows to watch this weekend?',
    'The biggest new TV picks for August 21–23 include Outer Banks Season 5, Lanterns, Flex X Cop Season 2, Conan O’Brien Must Go Season 3, LION and The Shards.',
    '### What is the best new movie to watch this weekend?',
    'For an adult drama, Mother Mary is one of the weekend’s biggest new streaming movie arrivals. For something lighter, try the Tamil romantic comedy Pyaar Prema Kalyanam.',
    '### What should I watch on Netflix this weekend?',
    'Start with Outer Banks Season 5 if you’ve followed the series. If you want a movie instead, Pyaar Prema Kalyanam arrives on Netflix on August 21.',
    '### What should I watch with my family this weekend?',
    'LION is our strongest all-around family recommendation. Camp Rock 3 is another easy option, particularly for a music-focused movie night.',
    '### Is there anything good for a short, relaxed watch?',
    'Try Conan O’Brien Must Go if you want comedy without a complicated storyline. A nature series such as LION is another good choice when you aren’t in the mood for a heavy drama.',
    '## Final Pick',
    'If we had to choose just one release for the weekend, it would depend on your mood.',
    'Want a binge? Go with Outer Banks. Want something unusual for movie night? Try Mother Mary. Want an easy family watch? Pick LION. Want something outside the usual Hollywood feed? Pyaar Prema Kalyanam or Flex X Cop are strong places to start.',
    'And if you’re still scrolling after all of that, that’s exactly the problem CineTonight is built to solve: choose your mood, narrow down the options and spend more time watching than searching.',
  ],
};

const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', POST.slug).maybeSingle();
if (existing) { console.log('skip (exists):', POST.slug); process.exit(0); }
const { error } = await sb.from('blog_posts').insert({
  slug: POST.slug, title: POST.title, cat: POST.cat, excerpt: POST.excerpt, body: POST.body,
  meta_title: POST.meta_title, meta_description: POST.meta_description,
  date_label: POST.date_label, read_label: POST.read_label, status: POST.status,
  publish_at: POST.publish_at,
});
console.log(error ? `FAIL ${POST.slug}: ${error.message}`
  : `scheduled for ${POST.publish_at}: ${POST.slug} (no image yet — add the generated featured image in the dashboard Media Library)`);
