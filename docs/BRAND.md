# Brand & Messaging Playbook

The single source of truth for how this site talks about itself — to users
and to Google. Every title tag, hero line, social bio, and blog intro should
be checkable against this document.

## Positioning

We are **the decision layer for streaming** — not a streaming service, not a
database. The user's problem is never "I can't find movies"; it is "I don't
know what to watch, or where it is." We own that answer.

One-liner: **"Know what to watch."**

Elevator pitch: *Your streaming guide for India — trailers, daily top 10s,
new OTT releases, and where to watch every movie & web series across
Netflix, Prime Video, JioHotstar, ZEE5 and more.*

Why this position works: every streaming platform answers "play this."
Only an independent guide can answer "watch THIS — and it's over HERE."
Netflix will never send a user to Prime. We will. That neutrality is the
brand's moat and its trust story.

## Audience

South Asia-first (India, Pakistan, Bangladesh, Sri Lanka, Nepal...),
global content, worldwide-ready. Copy leans on OTT (the category word in
South Asian English) and platform names spelled out — while every
region-sensitive surface (Where to Watch, channel pages/cards) resolves
the VISITOR's country automatically (lib/region.ts), so a viewer in
Karachi, Dhaka or London sees their own availability, never a geo-blocked
link. India remains the default fallback market (largest audience).

## The messaging formula

Use watch/streaming words heavily — but the OBJECT of the sentence must be
something we actually deliver.

**Say (always true here):**
- watch trailers · watch the trailer first
- what to watch tonight / this weekend
- where to watch / where to stream
- streaming now on Netflix / new on JioHotstar
- new OTT releases · OTT release date
- your streaming guide · your next watch
- top 10 today · updated daily

**Never say (promises we don't deliver + piracy-SERP neighborhood):**
- watch full movies / watch online free
- download / free download / HD print
- leaked · dubbed download · any piracy-site brand name
- anything implying full playback happens on this site

Why: SERP intent-matching IS the ranking strategy. Copy that promises what
the page delivers → clicks that stay → Google reads satisfaction → rankings
compound. Copy that over-promises → instant back-button ("pogo-sticking")
→ quiet demotion. The honest version is also the winning version.

## Approved copy blocks

(Swap {Brand} when the final name is chosen.)

- **Tagline:** Know what to watch.
  - Alternates: "Every trailer. Every platform. One place." ·
    "What to watch, where to watch it."
- **Homepage title tag:** {Brand} — What to Watch Tonight: Trailers, OTT
  Releases & Where to Stream
- **Meta description:** Find your next watch — trailers, ratings, and where
  to stream every movie & web series on Netflix, Prime Video, JioHotstar,
  ZEE5 and more. New OTT releases updated daily.
- **Hero:** "Your next watch starts here" / sub: "Trailers, top 10s and
  where-to-stream for every movie & show — updated daily."
- **Social bio:** India's streaming guide 🎬 What to watch + where to watch
  it. Daily OTT releases, trailers & top 10s.
- **About-page self-description:** a streaming guide / movie discovery
  platform. (State it plainly — transparency about what the site is feeds
  Google's trust assessment. Never cosplay as a streaming service.)

## Title formulas (per page type)

- Movie page: `{Title} ({Year}) — Cast, Trailer & Where to Watch`  ← live
- Channel page: `Latest {Platform} Movies & Web Series — Watch Trailers` ← live
- Blog/OTT-news post: `{Topic}: OTT Release Date, Where to Watch & Trailer`
- Listing pages: `{Genre} {Kind} — What to Watch on OTT`

## Monetization voice (future)

Premium is sold as "never wonder what to watch again" — OTT-release alerts
for followed titles, ad-free, personal recommendations. Revenue channels in
order: affiliate (Amazon Associates for Prime sign-ups; platform
affiliate/partner programs), display ads (AdSense → Ezoic/Mediavine as
traffic grows), sponsored release-week placements from OTT platforms and
distributors, then premium.

Hard rule: the site never offers, links to, or hints at unlicensed
watching/downloading. It is illegal (Cinematograph Act penalties, ISP-level
blocking in India), kills Google indexing, bans every ad network and
payment processor, and burns the brand permanently. The legal
"watch-on-site" options, if ever wanted: YouTube's licensed free-with-ads
movies and public-domain classics, clearly labeled.

## Brand name status

**FINAL (Aug 13, 2026): CineTonight.** Chosen because the brand SERP is
empty (only ghost: a French over-blog dead since 2012), the name IS the
positioning ("what to watch tonight" — our core query family), it's
entity-unambiguous for Google/AI engines, and "cine" is native vocabulary
across South Asia. Domain: cinetonight.com (registered via Porkbun).
Nearby-but-distinct: cine-night.com (grey-area streamer — different name,
different spelling; our clean-legal positioning is the insulation).

Runner-up shortlist kept for the record (all SERP-checked Aug 2026):

| Name | Style | Notes |
|---|---|---|
| CineDekho | Hindi-hybrid | #1 warmth pick; only ghost is a dead 2016 app listing |
| StreamDekho | Hindi-hybrid | zero results anywhere; carries "stream" |
| Trailora | Coined English | #1 English pick; zero results; literally = trailers |
| Bingera | Coined English | clean (shares name only with a 1935 navy ship); binge culture |
| CineJhalak | Hindi-hybrid | zero results; jhalak = glimpse/teaser = trailer |
| Bingely | Coined English | zero results; app-ish feel |

Eliminated after checks (do not revisit): WatchWave, StreamWave, CineKhoj
(piracy site!), OTTAdda, OTTDekho, WatchDekho, Streamora, StreamNest,
WatchNest, MovieMitra, CineMitra, CineTara, Cinora, Flickora, Cinevo,
Cinemora, Screenora, Movora, Watchora, Trailio, Flixora.

Before purchase: check .in + .com on a registrar, grab Instagram/YouTube
handles same day, run the name through IP India's trademark search
(tmrsearch.ipindia.gov.in).

## Rollout checklist (once the name is final)

1. site_settings (Dashboard → SEO & Settings): site title, description, keywords
2. Header/Footer brand text + tagline
3. app/layout.tsx metadata fallbacks · manifest.ts · opengraph-image.tsx · icon.tsx
4. Hero copy · About/Contact/Privacy/Terms pages (re-run seed-legal-pages.mjs)
5. NEXT_PUBLIC_SITE_URL → new domain (Vercel env) · redeploy
6. Google Search Console: add new domain property, submit sitemap
7. Social handles secured + bios set from this doc
