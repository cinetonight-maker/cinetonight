# MOVIEX — Next.js streaming site

The MOVIEX design (dark navy + purple, collapsible sidebar, right rail) built as a real
**Next.js (App Router) + TypeScript** app. Server-rendered pages, statically-generated
movie / blog / person routes, and client interactivity where it matters.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # type-checks + statically generates all pages
npm start
```

## Routes

```
/                 Home — hero, Continue Watching, curated rows, blog, right rail
/movies /web-series /tv-shows /trending /latest   Listings (genre filter + sort)
/genres           Genre tiles
/my-list          Your watchlist (persists in the browser)
/search?q=        Search results
/movie/[id]       Movie detail (SSG) — where to watch, cast, info, about, reviews
/blog  /blog/[slug]   Blog index + article (SSG)
/person/[id]      Cast profile (SSG)
/pricing          Plans
/signin /signup   Auth
/not-found        404
```

## Structure

```
app/            layout (header + sidebar + footer + player) + every route
components/     Header, Sidebar (collapsible), MovieCard (hover popup), Row, Hero,
                RightRail widgets, Listing (filters/sort), MovieDetail, PlayerModal,
                WatchlistButton, ContinueWatching, BlogSection, Icon, Stars, Footer
lib/            data.ts (single source of truth) · types.ts · images.ts · watchlist.ts · player.ts
```

## Interactive features

- **Search** (header → `/search`), **genre filters + sort** on every listing.
- **Watchlist** saved in `localStorage`, live count in the header, drives **My List**.
- **Player modal** (Watch Now / Trailer / card play) with a Creative-Commons sample clip.
- **Collapsible left sidebar** (☰), hover **detail popups** on cards, themed carousels.

## How it's built

- **Data-driven** — every screen renders from `lib/data.ts`; add a movie there and it appears
  on the rows, listings, search, and gets its own statically-generated `/movie/[id]` page.
- **Server-best / fast** — RSC pages; all movie/blog/person routes pre-rendered at build (SSG).
  Only interactive bits ship as client components.
- **Typed** end to end (`strict` TypeScript).

## Swapping in real artwork

Posters use deterministic sample photos. Change the single `img` function in `lib/images.ts`
(e.g. point it at a TMDB image URL per id) and add the host to `images.remotePatterns` in
`next.config.mjs` — every poster/backdrop updates from that one place.

## Real data & artwork (TMDB)

The catalogue can pull real posters, backdrops, ratings, runtimes, genres, synopses and cast
(with photos) straight from TMDB.

```bash
# 1. Get a free API key (v3 auth): https://www.themoviedb.org/settings/api
# 2. Save it:
cp .env.example .env.local        # then paste your key into TMDB_API_KEY
# 3. Sync:
npm run sync
```

`npm run sync` reads **`lib/catalogue.mjs`** (the list of titles the site carries), looks each one
up on TMDB, and regenerates `lib/data.ts`. To add a title, add a line to `catalogue.mjs` and re-run
the sync — nothing else needs touching. If a search picks the wrong film, pin it with `tmdbId`.

Images come from TMDB's CDN, so **no API key is needed at runtime or in production** — only when
you re-sync. Anything TMDB has no image for falls back to placeholder art automatically.

## About the data

`lib/data.ts` is **generated** — edit `lib/catalogue.mjs` and run `npm run sync` rather than editing
it by hand. Until you run the sync it ships with hand-written metadata for 18 Indian films and web
series and placeholder artwork.

*Demo project. Reviews, platform availability and "continue watching" progress are illustrative.*
"# stream" 
