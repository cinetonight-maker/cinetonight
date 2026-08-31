# 01 — Project master context

## What the project is

**CineTonight** — a film and series discovery and decision platform.
Live at **https://cinetonight.com**. Launched **14 August 2026**.

Repository folder on the owner's machine: `D:\Cowork\Cine Tonight\cinetonight-site`
(note: an older path `D:\Cowork\Stream\moviex-site` appears in some session
configuration and no longer exists — the folder was renamed).

## What the website does

Helps a visitor decide what to watch, starting from mood, available time and
viewing situation rather than from a genre shelf, then shows where the chosen
title is **legally** streaming in the visitor's own country.

Every title page carries: trailer, cast, rating, runtime, certification, and a
live "Where to Watch" panel resolved to the visitor's region.

## Purpose and product goals

Stated by the owner, preserved in his own framing:

> The problem was never a lack of content. It was finding the right content.

Three mission points, as written into the live About page:
- Reduce decision fatigue
- Help people discover films that suit them
- Make legal viewing straightforward

## What makes it different

- Region-aware streaming availability, resolved per visitor, not a single market
- Mood/time/situation-first discovery rather than genre browsing
- An explicit editorial certainty convention (Confirmed / Reported / inference)
- Free classic Bollywood films in the public domain, with a legal explainer
- Explicitly **not** a piracy site: hosts nothing, links only to licensed platforms

## Target audience

Global, with a stated lean toward India. **Note a tension worth knowing:** the
site's best-performing pages during the measured period were Western and
international arthouse titles (Hallam Foe, The Skin I Live In, Nando Between
Two Worlds), which suggests actual traffic is more international than the
positioning assumes. The owner chose **US** as the server-rendered availability
region on that basis. The country breakdown in Search Console was never
actually checked — see `CONFLICTS_AND_UNKNOWN.md`.

## Main priorities

1. Protect and grow movie pages — they produce essentially all organic traffic
2. Keep Cloudflare cost bounded (there is a real cost incident in the history)
3. Build entity and authority signals (named authors, About, editorial standards)
4. Blog exists to support movie pages, not as a standalone traffic play

## Long term goals

Positioning target, in the owner's words: **"What should I watch tonight?"**
Discovery made faster and more useful through mood, runtime, genre, streaming
service, recommendations, Tonight's Pick and CineTonight Match.

Explicitly **not** a goal: becoming another IMDb-sized database.

Monetisation direction: Amazon affiliate, once traffic justifies it. Affiliate
infrastructure already exists (`AMAZON_TAG`, `rel="sponsored"`, disclosure copy).

## The people

- **Shahzaib Ali** — founder. Builds and runs the site, the recommendation
  system and the availability data. This is the account owner.
- **Syed Ahmad** — writer and editor. Guides, articles, editorial content.

Both are now named in `lib/authors.ts`, on `/about-us`, in the FAQ, and in
per-article `Person` schema.

## Important terminology

| Term | Meaning in this project |
| --- | --- |
| **Where to Watch (W2W)** | The per-title streaming availability panel |
| **Movie pages** | `/movie/<id>` — the primary SEO asset |
| **Curated catalogue** | Small hand-picked title set in Supabase |
| **Live TMDB titles** | `/movie/tmdb-m-<id>-<slug>` — the ~24k long tail |
| **Tier A / B / C** | Catalogue quality tiers in `lib/quality.ts` |
| **Confirmed / Reported** | Editorial certainty labels, mandatory on release dates |
| **Discovery quality** | Tier A — eligible for homepage and discovery shelves |
| **The 18-check checklist** | Blog publish checklist in the admin editor; target 18/0/0 |

## Before touching anything

Read `docs/CONTENT-RULES.md` in full. It is authoritative for content and every
rule in it exists because breaking it caused a real, documented problem.
