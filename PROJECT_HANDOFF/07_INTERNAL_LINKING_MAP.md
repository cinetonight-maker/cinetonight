# 07 — Internal linking map

Only real, verified URLs appear here. Anything unverified is marked UNKNOWN.

## Hubs (in sitemap, verified)

`/` · `/movies` · `/tv-shows` · `/web-series` · `/trending` · `/latest` ·
`/genres` · `/discover` · `/free-movies` · `/blog` · `/faq` · `/follow`

## Channel pages (15, verified)

`/channel/` + netflix · prime-video · jiohotstar · apple-tv · zee5 · sony-liv ·
crunchyroll · viki · sun-nxt · hoichoi · shemaroo-me · lionsgate-play ·
youtube · mx-player · aha

## Genre filters (verified in sitemap)

`/movies?genre=` + Action · Adventure · Animation · Comedy · Crime · Drama ·
Family · Fantasy · Horror · Mystery · Sci-Fi · Thriller

**Caution:** `docs/CONTENT-RULES.md` sanctions only Action, Adventure, Drama,
Mystery, Sci-Fi for editorial links. The sitemap lists more. Middleware 308s
any non-canonical genre value.

## Custom pages (verified)

`/about-us` · `/contact` · `/privacy-policy` · `/terms-of-service`

`/contact-us` was **retired on 26 August** and now 307/308s to `/contact`.
Do not link to it.

## Free classics (19, verified)

`/free-movies/` + awaara-1951 · shree-420 · mother-india · pyaasa ·
mughal-e-azam · madhumati · chalti-ka-naam-gaadi · baiju-bawra ·
kaagaz-ke-phool · howrah-bridge · sahib-bibi-aur-ghulam · chori-chori ·
anari-1959 · mr-and-mrs-55 · cid-1956 · kismet-1943 · mahal-1949 ·
nau-do-gyarah · munimji

## Blog (12 live, verified)

`/blog/` + what-to-watch-on-netflix · best-anime-for-beginners ·
cant-decide-what-to-watch-tonight · what-to-watch-this-weekend-august-21-23-2026 ·
dune-3-release-date-cast-plot-trailer · best-date-night-movies ·
what-to-watch-before-avengers-doomsday · avengers-doomsday-release-date-india ·
spider-man-brand-new-day-ott-release-date · michael-ott-release-date-jiohotstar ·
jana-nayagan-ott-release-date · cocktail-2-ott-release-date

## Movie pages

Two forms:
- **Curated:** `/movie/<slug>` e.g. `/movie/lanterns`, `/movie/toy-story-5`,
  `/movie/spider-man-brand-new-day`, `/movie/insidious-out-of-the-further`,
  `/movie/house-of-the-dragon`, `/movie/avengers-doomsday`
- **Live TMDB:** `/movie/tmdb-m-<tmdbId>-<slug>` e.g.
  `/movie/tmdb-m-2239-hallam-foe` (verified), `/movie/tmdb-m-129-spirited-away`,
  `/movie/tmdb-m-1333100-attack-on-titan-the-last-attack`,
  `/movie/tmdb-m-1311031-demon-slayer-kimetsu-no-yaiba-infinity-castle`

**All other movie URLs are UNKNOWN and must be verified before use.**

## Author pages (PENDING, not deployed)

`/author/shahzaib-ali` · `/author/syed-ahmad`

## Hub and spoke, as intended

```
Blog article  →  individual movie pages   (LARGELY MISSING — the main gap)
Blog article  →  channel pages            (partially done)
Movie page    →  related movie pages      (automatic, via TMDB recommendations)
Movie page    →  person pages             (noindex, follow — passes value on)
Homepage      →  discovery + movie pages
Author page   →  that author's articles   (PENDING)
```

## Anchor text

Descriptive and natural, inside a sentence that was already making the point.
Not "click here", not exact-match stuffing. The pattern in
`best-anime-for-beginners` — "Spirited Away on CineTonight" — is the model.

## Known defects

- Posts #3-#10 have zero in-body links
- `cant-decide-what-to-watch-tonight` links in-body to
  `/blog/what-should-i-watch-tonight-how-to-decide-in-5-minutes`, which now
  redirects. Works, but adds an avoidable hop. Should point at itself's target.
- The weekend post names ten films and links two

## V2 linking architecture

**UNKNOWN.** No V2 internal linking architecture has been designed or discussed.
