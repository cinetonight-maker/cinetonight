#!/usr/bin/env node
/**
 * Dune: Part Three hub — scheduled for the next slot in the cadence
 * (20 Aug, 9 AM PKT — the day after the date-night guide goes live).
 * Run once from the project root:  node scripts/seed-dune3-post.mjs
 *
 * First post authored with the new heading structure: "## " lines render as
 * H2 section headings, "### " as H3 (see app/blog/[slug]/page.tsx). Main
 * sections are H2; FAQ questions are H3 under the FAQ H2.
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
  slug: 'dune-3-release-date-cast-plot-trailer',
  status: 'scheduled',
  publish_at: '2026-08-20T04:00:00Z', // 9 AM PKT, day after the date-night guide
  date_label: '20 Aug 2026',
  read_label: '8 min',
  cat: 'News',
  title: 'Dune 3: Release Date, Cast, Plot, Trailer and Everything We Know',
  meta_title: 'Dune 3: Release Date, Cast, Plot & Trailer',
  meta_description: 'Dune 3 arrives in December 2026. Get the confirmed release date, cast, Dune Messiah story, trailer details and latest Dune: Part Three updates.',
  excerpt: 'Dune: Part Three is confirmed for December 18, 2026 — adapting Dune Messiah, with Timothée Chalamet and Zendaya returning and Robert Pattinson joining as Scytale. Here is everything officially confirmed so far.',
  body: [
    'Status: Confirmed · Last updated: August 2026',
    'Denis Villeneuve is returning to Arrakis one more time with Dune: Part Three, the movie most fans are simply calling Dune 3. After Paul Atreides completed his rise to power in Dune: Part Two, the third film will explore what happens when victory turns into responsibility, conflict and consequences on a much larger scale.',
    'Warner Bros. and Legendary have now moved well beyond early development. Dune: Part Three has an official title, a confirmed theatrical release date, an expanded cast and multiple trailers already released. The official movie site describes the film as the conclusion to Villeneuve’s trilogy and confirms that it is based on Frank Herbert’s Dune Messiah.',
    'Here is everything currently confirmed about Dune 3, including the release date, returning cast, new characters, story direction and what the trailers reveal.',
    '## When Is Dune 3 Coming Out?',
    'Dune: Part Three is scheduled to arrive in theaters on December 18, 2026.',
    'Legendary lists December 18, 2026 as the film’s official release date, and the official Dune website is promoting the movie as an exclusively theatrical release on December 18. That makes the third film one of the biggest theatrical releases currently positioned for the end of 2026.',
    'There is no confirmed streaming release date yet on the official Dune website, so any specific streaming date should currently be treated as speculation rather than confirmed information. The official campaign is focused on the theatrical release.',
    '## What Is the Official Title of Dune 3?',
    'The official title is Dune: Part Three.',
    'For years, the project was commonly referred to as Dune Messiah, because Villeneuve had made clear that Frank Herbert’s second Dune novel would provide the foundation for another movie. The finished film, however, is officially being marketed as Dune: Part Three, and the official synopsis confirms that Villeneuve and co-writer Brian K. Vaughan adapted the story from Dune Messiah.',
    'That title also makes the movie easier to understand for audiences who have followed Dune and Dune: Part Two without reading Herbert’s novels.',
    '## What Is Dune 3 About?',
    'The most important difference between Dune: Part Three and the first two movies is that the story is no longer primarily about Paul Atreides trying to gain power. It is about what happens after he gets it.',
    'The new film takes place nearly two decades after Paul seizes control of the Imperium. Current footage places the jump at around 17 years, moving the story far beyond the immediate aftermath of Dune: Part Two. That changes the entire dramatic question.',
    'Paul is no longer the young outsider fighting the Harkonnens and trying to survive on Arrakis. He is now a ruler facing the consequences of the empire created in his name, while political enemies, old relationships and new threats close in around him.',
    'That direction comes directly from the themes of Dune Messiah, which examines the danger of charismatic leaders, the cost of religious fanaticism and the limits of someone who appears able to see the future. Villeneuve is therefore moving the story beyond a straightforward rise-of-a-hero narrative — Paul’s victory at the end of Part Two was not necessarily the happy ending it might have appeared to be.',
    '## Dune 3 Cast: Who Is Returning?',
    'The official cast for Dune: Part Three brings back many of the most important characters from the first two films.',
    'Timothée Chalamet returns as Paul Atreides, while Zendaya returns as Chani. The confirmed ensemble also includes Jason Momoa, Florence Pugh, Rebecca Ferguson, Isaach De Bankolé, Charlotte Rampling, Anya Taylor-Joy and Javier Bardem.',
    'Robert Pattinson is one of the biggest new additions to the franchise and appears as Scytale, a major figure in the new conflict surrounding Paul. The official cast also includes newcomers Nakoa-Wolf Momoa and Ida Brooke.',
    'One of the most interesting confirmed returns is Jason Momoa. His presence immediately raises questions for anyone who remembers what happened to Duncan Idaho in the first Dune, and the promotional campaign has deliberately made his return part of the intrigue surrounding the third film. Official Legendary merchandise for Part Three even includes a character poster for “Hayt,” a name familiar to readers of Dune Messiah. That is probably a story detail best discovered in the movie if you have not read the books.',
    '## Is Anya Taylor-Joy in Dune 3?',
    'Yes. Anya Taylor-Joy officially returns in Dune: Part Three after her brief appearance in Dune: Part Two. She plays Alia Atreides, Paul’s younger sister, and her role is expected to be significantly more important now that the story has jumped forward in time.',
    'Her increased presence is one of the clearest consequences of the film’s large time jump.',
    '## Is There a Dune 3 Trailer?',
    'Yes — Warner Bros. and Legendary have already released more than one major look at the film.',
    'The first major trailer presentation arrived in March 2026, revealing the older versions of several characters, the large time jump and Robert Pattinson’s arrival in the story. A more extensive trailer followed in July 2026, with additional footage of Paul, Chani, large-scale conflict and the continuing visual spectacle of Arrakis, unveiled alongside an international IMAX fan event.',
    'The footage makes one thing clear: although Dune Messiah is often considered more political and introspective than the original Dune, Villeneuve is not turning the third film into a small-scale political drama. The movie still appears designed as a major theatrical spectacle.',
    '## Will Dune 3 Be an IMAX Movie?',
    'Very much so. Villeneuve has described Dune: Part Three as a movie intended for the largest possible screen, and the production used both 65mm and IMAX film photography. He said during the March trailer presentation that the film was specifically meant to be experienced in IMAX.',
    'The official Dune campaign has also promoted IMAX 70mm opening-weekend screenings, reinforcing how important the premium theatrical presentation is to the release strategy. For viewers who considered the scale and cinematography major parts of the first two films’ appeal, Part Three appears to be continuing that approach.',
    '## Is Dune 3 Based on Dune Messiah?',
    'Yes. The official movie site directly confirms that Dune: Part Three is based on Frank Herbert’s 1969 novel Dune Messiah.',
    'That matters because Messiah is not simply another story about conquering enemies on Arrakis — it is largely concerned with the consequences of Paul’s rise. The first two movies showed how a young heir became the figure at the center of a political and religious revolution. Part Three now has the opportunity to examine whether the power Paul gained can actually be controlled.',
    'That makes the third movie potentially darker than the previous two, even if its trailers continue to promise large-scale action.',
    '## Is Dune: Part Three the Last Dune Movie?',
    'It is being positioned as the end of Denis Villeneuve’s trilogy — the official website calls Dune: Part Three the conclusion to his three-film story.',
    'That does not necessarily mean Warner Bros. and Legendary can never make another film set in Frank Herbert’s universe. Herbert wrote additional novels, and the wider Dune franchise already extends beyond these three movies. But as far as Villeneuve’s Paul Atreides story is concerned, Part Three is currently being marketed as the conclusion.',
    'That gives the movie a difficult task: it must work as an adaptation of Dune Messiah while also bringing the cinematic story that began with Dune in 2021 to a satisfying endpoint.',
    '## Why Dune 3 Could Feel Very Different From Parts One and Two',
    'The first Dune was largely about survival and destiny. Dune: Part Two transformed that story into war, political revolution and Paul’s ascent. Dune: Part Three begins from a more complicated place: Paul has already won.',
    'That allows Villeneuve to ask what happens when the person audiences followed as a hero becomes one of the most powerful people in the universe. The 17-year jump also means relationships have changed, political alliances have matured and an entirely new generation has entered the story.',
    'Rather than repeating the structure of the previous films, Part Three has the opportunity to challenge the very idea of Paul Atreides as a conventional chosen-one hero. For longtime Dune readers, that is one of the most important parts of Herbert’s story. For movie-only audiences, it could make the final chapter much less predictable than simply another battle for Arrakis.',
    '## Dune 3 Frequently Asked Questions',
    '### What is Dune 3 called?',
    'The official title is Dune: Part Three. It adapts Frank Herbert’s Dune Messiah.',
    '### When does Dune 3 come out?',
    'Dune: Part Three is currently scheduled for December 18, 2026, exclusively in theaters at launch.',
    '### Is Zendaya returning for Dune 3?',
    'Yes. Zendaya officially returns as Chani alongside Timothée Chalamet’s Paul Atreides.',
    '### Is Robert Pattinson in Dune 3?',
    'Yes. Robert Pattinson has joined the cast and is playing Scytale.',
    '### Is Dune 3 the final movie?',
    'It is officially being promoted as the conclusion of Denis Villeneuve’s Dune trilogy.',
    '## Final Word',
    'Dune: Part Three is no longer a distant possibility. The movie is finished enough to be deep into its promotional campaign, the cast is confirmed, trailers are out, and the December 2026 theatrical release is firmly on the calendar.',
    'More importantly, the third film is not simply trying to recreate the journey of Dune and Dune: Part Two. By adapting Dune Messiah and jumping almost two decades forward, Villeneuve is turning the final chapter toward the consequences of Paul Atreides’ victory. That may ultimately be what makes Dune 3 the most interesting film of the trilogy.',
    'CineTonight will update this page if Warner Bros. or Legendary confirms additional release, runtime, streaming or story information.',
  ],
  tmdb: { kind: 'movie', query: 'Dune Part Three', fallback: { kind: 'movie', query: 'Dune Part Two' } },
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
console.log('NOTE: headings in this post need the heading-renderer deploy to be live first, or ## lines will show as plain text.');
