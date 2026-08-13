# Pre-Launch Deep Audit — Aug 13, 2026

Full-site pass over code, performance, SEO, links, layout and
responsiveness. Everything marked FIXED is already in the codebase and
synced; items under "Recommendations" need a human decision.

## Performance (the "page speed" issue)

- **FIXED — homepage fetch waterfall.** The page awaited two full network
  waves in sequence (17+ live-section fetches, THEN all dashboard rows).
  Rows now resolve after the heavy wave has already settled, cutting
  server response time. All TMDB calls remain 6h-cached, so steady-state
  traffic barely touches TMDB.
- **FIXED — series pages.** Season data was a third sequential round-trip
  after related/featured; it now runs in parallel with them. The non-TMDB
  branch's two fetches also now run concurrently.
- **FIXED — TMDB CDN preconnect.** Nearly every image is served from
  image.tmdb.org; the connection now opens during HTML parse, shaving the
  TLS handshake off first poster paint (LCP).
- Already good: self-hosted fonts (no Google Fonts round-trip), trailer
  iframes load only on click, self-hosted channel logos, next/image with
  explicit `sizes` everywhere, Vercel Analytics + Speed Insights wired.
- NOTE: real-world speed verdicts should come from Vercel Speed Insights
  after deploy — the localhost numbers are not representative.

## Dead code removed

- **CSS:** entire old movie-hero block (.dhero/.dposter/.dtitle/.dmeta/
  .drate/.imdb-badge/.votes/.score/.ring/.dsyn/.dbtns), old platform strip
  (.platstrip*, .plat-note) and the older 5-card platform grid (.plat*).
  ~2KB of styles and several stale comments gone; brace balance verified.
- **Components:** WatchlistButton's unused "save" variant removed. The
  movie-page loading skeleton was rebuilt to mirror the CURRENT layout
  (trailer banner + detail bar) instead of the deleted old hero.
- **Unused files (safe to delete by hand — they're not imported anywhere,
  so they don't ship in the bundle):** components/PlatformStrip.tsx,
  components/ContinueWatching.tsx, components/PlayButton.tsx.

## Bugs fixed

- Stray unclosed `@media(max-width:520px){` left the stylesheet nesting a
  chunk of desktop rules inside a mobile query (valid CSS nesting syntax,
  so no build error — silently wrong styles). Fixed; 779/779 braces.
- Duplicate homepage rail: the dashboard-configured "Top Rated" row
  duplicated the new "Top Rated Movies (all time)" section — the config
  row is now skipped in render (rename its id in /admin to bring it back).

## Links

- **FIXED:** footer "#" dead links. Help Center and DMCA now route to
  /p/contact; Refund Policy (no page exists) removed from the fallback.
  All footer links now resolve. (Dashboard nav_links still override.)
- Verified 200s: / , /movie/[id], /free-movies, /search, /channel/[slug],
  /blog, /p/contact, /movies, /pricing.

## SEO

- **FIXED — WebSite JSON-LD with SearchAction** in the root layout: makes
  the site eligible for a Google sitelinks search box.
- Verified present: metadataBase (correct OG image URLs), per-page
  canonicals, Movie JSON-LD with AggregateRating, VideoObject on free
  movies, robots.ts, live sitemap incl. channels + classics, RSS
  autodiscovery, JustWatch attribution on availability data.
- STILL REQUIRED AT DEPLOY: `NEXT_PUBLIC_SITE_URL` env var in Vercel —
  without it every canonical/OG/sitemap URL says localhost. This is the
  single biggest launch-day SEO item.

## Responsiveness

Checked at 375px (homepage, movie page, free-movies): **zero horizontal
overflow** on all three; detail bar wraps correctly, w2w rows stack, rails
scroll. Desktop verified at 1400px.

## Recommendations (need your call — nothing done)

1. **Brand name decision** still gates the rebrand pass (see BRAND.md).
2. Footer tagline still says "Watch the latest movies… in HD quality" —
   consider the BRAND.md voice ("Know what to watch") at rebrand time.
3. "© 2024 MOVIEX · Demo project." in the footer — update year via
   `new Date().getFullYear()` and drop "Demo project" at launch.
4. Consider deleting the three unused component files above in one commit.
5. Blog has 4 posts — for SEO momentum, 1–2 posts/week targeting "ott
   release date" queries is the highest-leverage content habit.
6. After deploy: enable Vercel Analytics + Speed Insights toggles, submit
   sitemap in Search Console, then watch which queries bring impressions
   and double down on those page types.
