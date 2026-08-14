#!/usr/bin/env node
/**
 * Seed the launch blog posts as DRAFTS.
 * Run once from the project root:  node scripts/seed-blog-posts.mjs
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY.
 * Safe to re-run: existing slugs are left untouched (never overwritten),
 * so anything you've edited or published in the dashboard is preserved.
 * Post 1 of the pack (what-should-i-watch-tonight) is not seeded because
 * a version of it is already live on the blog.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// minimal .env.local loader (no dotenv dependency)
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
    "slug": "free-classic-bollywood-movies-online",
    "title": "10 Classic Bollywood Movies You Can Watch Free & Legally Online",
    "cat": "Free Movies",
    "excerpt": "The golden age of Hindi cinema is now in the public domain, which means you can watch full classics like Awaara free and 100% legally. Here are ten to start with.",
    "meta_title": "10 Classic Bollywood Movies, Watch Free & Legally Online",
    "meta_description": "Awaara, Pyaasa, golden-age Raj Kapoor and Guru Dutt classics, full movies you can watch free and 100% legally online, no signup. Here's how it works.",
    "body": [
      "Here's a fact that surprises almost everyone: some of the greatest Hindi films ever made are completely free to watch, legally, in full, with no signup and no shady websites. Not because someone pirated them, but because their copyright has expired. In India, a film's copyright lasts 60 years from release. That means the entire golden age of Bollywood, Raj Kapoor, Guru Dutt, Nargis, Madhubala, Dilip Kumar, Dev Anand, now belongs to everyone.",
      "These films are preserved and streamed by the nonprofit Internet Archive, the same organization that runs the internet's Wayback Machine. CineTonight's Free Movies section embeds their player directly, the same way a YouTube video embeds, so you can watch on a clean, fast page with the film's cast, rating and story alongside. Nothing is hosted on our servers, nobody's rights are touched, and you never pay a rupee.",
      "Where to start? Awaara (1951) is the obvious answer, Raj Kapoor's tramp-and-judge masterpiece that became a worldwide phenomenon and still holds up as pure entertainment. From there, work through the Guru Dutt catalogue: Pyaasa (1957), his aching poem about art and worth, regularly appears on lists of the greatest films ever made, not greatest Indian films, greatest films, full stop.",
      "The joy of the golden age is its range. There are crackling crime capers and noir thrillers from 1950s Bombay that feel decades ahead of their time. There are the great romances and family sagas that defined what Hindi cinema would become. There are songs, Shailendra, Sahir, S.D. Burman, that you already know by heart even if you've never seen the films they come from. Watching them in their original films is like meeting old friends where they actually live.",
      "A practical tip: these are restored prints of 70-year-old films, so picture quality varies from surprisingly crisp to charmingly weathered. Watch on a phone or laptop rather than a huge TV and they look great. Subtitles are available on some prints but not all.",
      "Our editors hand-check every film on the shelf twice: once that the print actually plays, and once that the film is genuinely out of copyright. The full shelf, with posters, ratings and one-tap playback, is at cinetonight.com/free-movies, and it grows every month.",
      "Frequently asked questions",
      "Is it really legal to watch these old movies free?",
      "Yes. In India, film copyright lasts 60 years from release. Films from the golden age have outlived their protection and are in the public domain, watching them is as legal as watching a trailer.",
      "Do I need an account or app to watch?",
      "No. Every film in CineTonight's Free Movies section plays directly in your browser with no signup, no subscription, and no payment of any kind.",
      "Why do some classic films look grainy?",
      "The prints are digitized from decades-old film reels. Restoration quality varies by title, part of the charm is watching cinema history exactly as it survived."
    ]
  },
  {
    "slug": "is-it-legal-to-watch-free-movies-online",
    "title": "Is It Legal to Watch Free Movies Online? Public Domain, Explained Simply",
    "cat": "Guides",
    "excerpt": "Free doesn't always mean piracy. Here's the plain-language difference between illegal streaming sites and genuinely legal free movies, and how to tell them apart in 10 seconds.",
    "meta_title": "Is It Legal to Watch Free Movies Online? Explained Simply",
    "meta_description": "When is a free movie legal and when is it piracy? Public domain, official free streaming, and the 60-year rule explained in plain language.",
    "body": [
      "Type 'watch movies free' into any search engine and you'll get two very different kinds of results mixed together: sites breaking the law, and sites doing something completely legitimate. They can look confusingly similar. Here's how to tell them apart, in plain language, no legal jargon.",
      "First, the illegal kind. If a movie released this year is streaming free in HD on a site you've never heard of, that's piracy, full stop. Those sites host or link to copies they have no rights to. Beyond the legal risk, they're the internet's malware capital: fake play buttons, forced redirects, and downloads you didn't ask for. If a site is covered in pop-ups and asks you to 'disable your antivirus', close the tab.",
      "Now the legal kind, and there's more of it than people think. Category one: public domain films. Copyright doesn't last forever; in India it expires 60 years after a film's release. Once it does, the film belongs to the public, anyone can watch, share, or stream it, free, with zero permission needed. That's why golden-age Bollywood classics are legally free today. Category two: films the rights holders themselves put up free, official YouTube channels of studios release full movies with ads, and ad-supported services legally stream licensed catalogues free. Category three: nonprofit archives like the Internet Archive, which preserve out-of-copyright cinema and stream it as a public service.",
      "The 10-second test: ask who benefits and who's hiding. Legal free sites tell you exactly why the film is free ('this film is in the public domain', 'official channel of the studio') and have nothing to hide, real contact pages, real policies. Pirate sites hide everything: no names, no contact, servers nowhere, and a new domain every month because the last one got blocked.",
      "CineTonight sits firmly on the legal side, and we're precise about it: our Free Movies section carries only public-domain classics and officially released free films, each hand-checked by our editors before it appears. For everything newer, we show you trailers and then point you to the legitimate platform that carries it, Netflix, Prime Video, JioHotstar and the rest, via the live Where to Watch panel on every title page. We never host or link to pirated copies of anything. That's a permanent promise, not a policy.",
      "The bottom line: 'free' is a price, not a crime, what matters is whether the person offering it has the right to. Sixty-year-old classics on a nonprofit archive: legal and wonderful. This year's blockbuster on a pop-up-riddled mirror site: illegal and probably hazardous to your device. Now you know the difference at a glance.",
      "Frequently asked questions",
      "Can I get in trouble for watching pirated streams?",
      "Laws vary by country, but distribution and hosting carry the serious penalties; either way, pirate sites expose you to malware and scams. With so much legally free content available, the risk simply isn't worth it.",
      "What does public domain mean for movies?",
      "It means the film's copyright has expired, so it belongs to everyone. In India that happens 60 years after release. Public-domain films can be watched, shared and streamed freely by anyone.",
      "How do I know a free movie site is legal?",
      "Legal sites explain why their films are free, name themselves, and have real contact and policy pages. Pirate sites hide their identity, drown you in pop-ups, and stream brand-new releases they could not possibly have rights to."
    ]
  },
  {
    "slug": "netflix-vs-prime-video-vs-jiohotstar-2026",
    "title": "Netflix vs Prime Video vs JioHotstar: Which OTT Is Worth It in 2026?",
    "cat": "OTT Guide",
    "excerpt": "If you can only pay for one streaming app, which should it be? A practical 2026 comparison of the big three, by price, by content, and by what kind of viewer you are.",
    "meta_title": "Netflix vs Prime Video vs JioHotstar (2026): Worth It?",
    "meta_description": "Netflix, Prime Video and JioHotstar compared for 2026, prices, content strengths, and which single OTT subscription gives the most value in South Asia.",
    "body": [
      "Streaming subscriptions add up fast. Three apps at a few hundred rupees each is a real monthly bill, and most households quietly pay for at least one service they barely open. So here's the practical question this guide answers: if you paid for only ONE, which should it be in 2026? (Prices below are India's current plans at the time of writing, always confirm on the platform's own site, as they change often.)",
      "The price picture first. Netflix runs from about ₹149 a month for the mobile-only plan up to ₹649 for 4K on every screen. Amazon Prime Video is about ₹299 monthly, but its real trick is the yearly plan at roughly ₹1,499, effectively ₹125 a month, the cheapest full-service option among the three, and it bundles Amazon's delivery perks. JioHotstar's premium tier lands around ₹299 a month, also with a ₹1,499-per-year option, and cheaper mobile tiers exist.",
      "Now what each is actually FOR. Netflix is the quality-of-originals pick: the strongest slate of original series and films, the best app experience, and the deepest Korean drama catalogue with dubs and subtitles, if K-dramas are your thing, this alone can decide it. Prime Video is the value pick: excellent Indian originals (Mirzapur and Panchayat built its reputation), Hollywood films arriving fast after theatres, and that yearly price. JioHotstar is the sports-and-family pick: cricket is its kingdom, IPL and ICC tournaments, plus Disney's catalogue and HBO's prestige shows, which makes it the one subscription that can satisfy a whole household with one bill.",
      "So the honest answers by viewer type: a cricket household should take JioHotstar without hesitation, no other app replaces live sport. A binge-watcher chasing the shows everyone talks about should take Netflix. A family that wants maximum movies-per-rupee should take Prime Video yearly. And if you're a movie lover more than a series person, remember rotation: subscribe to one service for a month, finish what you came for, cancel, and switch. Nothing stops you, and it halves the yearly cost.",
      "One more money-saver: check what you already have. Many mobile and broadband plans in India and Pakistan bundle OTT subscriptions at no extra cost, a surprising number of people pay twice without realizing.",
      "Whichever you choose, the discovery problem stays, knowing a title exists doesn't tell you which app has it, in your country, this month. That's the gap CineTonight fills: every title page shows a live Where to Watch panel for your region, so before you subscribe to anything, you can check where the things you actually want to see really live.",
      "Frequently asked questions",
      "Which OTT platform has the best value in India in 2026?",
      "For pure price-per-content, Prime Video's yearly plan (about ₹1,499, effectively ₹125/month) is hard to beat. For sports households JioHotstar justifies its cost, and Netflix leads on original series quality.",
      "Do I need more than one OTT subscription?",
      "Most viewers don't. Pick the one matching what you watch most, and rotate monthly subscriptions for the rest, subscribe, binge, cancel, switch. It's allowed and it saves thousands per year.",
      "How do I know which app has the movie I want?",
      "Search the title on CineTonight, every movie and show page includes a live Where to Watch panel showing which platforms carry it in your country right now."
    ]
  },
  {
    "slug": "how-to-find-where-a-movie-is-streaming",
    "title": "How to Find Where Any Movie Is Streaming, In Your Country",
    "cat": "How-To",
    "excerpt": "The same movie can be on Netflix in one country and JioHotstar in another. Here's why availability differs by region, and the fastest way to check where anything is streaming where you live.",
    "meta_title": "How to Find Where Any Movie Is Streaming in Your Country",
    "meta_description": "Stop searching app by app. Here's how to instantly check which OTT platform has any movie or show in your country, and why availability differs by region.",
    "body": [
      "You hear about a movie, open Netflix, search, nothing. Try Prime, nothing. A friend swears it's streaming, and it is… in a different country. Few things about streaming are more confusing than regional availability, so let's demystify it once, then fix it forever.",
      "Why does this happen? Because streaming rights are sold country by country. A studio might sell a film's India rights to JioHotstar, its US rights to Netflix, and its Middle East rights to a third platform entirely, all at once, all legitimate. Rights also expire and move: a film that spent two years on one app can jump to a rival next month. So 'what's on Netflix?' has a different true answer in Karachi, Mumbai, Dhaka and London, and any list you find online may already be out of date.",
      "The slow way to check is opening every app and searching one by one. The fast way is a availability lookup that already knows your country. On CineTonight, open any movie or show page and look below the trailer: the Where to Watch panel detects the country you're browsing from and shows which platforms carry that title there right now, for streaming, and where relevant for rent or purchase, with a direct link into each platform's own app or site. The data refreshes live, so when rights move, the panel moves with them.",
      "Three practical tips that come from how the rights system works. One: if a title shows as unavailable in your country today, check again in a few weeks, licensing windows open and close constantly, and new OTT release dates for big films are announced weekly (our blog and Latest section track these). Two: a title missing from streaming may still be cheap to rent digitally, the panel shows those options too, and a one-time rent is often cheaper than a new subscription. Three: free, legal options exist more often than you'd guess, from ad-supported catalogues to public-domain classics like the ones in our Free Movies section.",
      "A word on the 'obvious workaround': VPNs. Streaming platforms actively block them, and watching through one generally breaches the platform's terms of service, your paid account can be restricted for it. Between live availability checking, digital rentals, and the sheer speed at which big titles now reach South Asian platforms, the legitimate routes are better than their reputation.",
      "The habit that ends the frustration: search the title on CineTonight first, trailer, ratings, cast and where-to-watch on one page, decide in a minute, then open the one app that actually has it. Searching app by app is over.",
      "Frequently asked questions",
      "Why is a movie on Netflix in one country but not mine?",
      "Streaming rights are licensed per country. The same film can legitimately belong to different platforms in different regions, and those deals change as licenses expire and move between services.",
      "How can I check which app has a movie in my country?",
      "Open the movie's page on CineTonight, the Where to Watch panel automatically shows live availability for the country you're browsing from, with direct links to each platform.",
      "What if a movie isn't streaming anywhere in my region?",
      "Check its digital rent/buy options (shown in the same panel), watch for it in our new OTT releases coverage, windows change monthly, or explore legal free alternatives like public-domain classics."
    ]
  }
];

for (const p of POSTS) {
  const { data: existing } = await sb.from('blog_posts').select('id').eq('slug', p.slug).maybeSingle();
  if (existing) { console.log('skip (exists):', p.slug); continue; }
  const { error } = await sb.from('blog_posts').insert({
    slug: p.slug, title: p.title, cat: p.cat, excerpt: p.excerpt, body: p.body,
    meta_title: p.meta_title, meta_description: p.meta_description,
    date_label: dateLabel, read_label: '5 min', status: 'draft',
  });
  console.log(error ? ('FAIL ' + p.slug + ': ' + error.message) : ('seeded draft: ' + p.slug));
}
console.log('Done. Open Dashboard -> Blog to add feature images and publish on your schedule.');
