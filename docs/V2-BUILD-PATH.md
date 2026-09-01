# V2 build path — the one plan we follow

**Rule zero (never violated):** no new URLs, no changed URLs, no deleted URLs. V2 is a visual + template upgrade ON the existing routes. The preservation contract in the handover package governs. Live site stays frozen; all work happens on the `v2` branch; only the founder deploys.

**Rule one (build to scale):** every V2 module renders from data that exists, and hides itself when data doesn't — the sparse/Level-B state is the DEFAULT for ~24k long-tail pages, the rich state appears as editorial data is added per title. No module may fake content to fill space. No per-URL cache growth (the R2 lessons stay law: no new ISR on unbounded spaces, person/blog/[slug] stay force-dynamic, path guard untouched).

**Design source of truth:** the "CineTonight V2" canvas + static exports in `CineTonight_V2_Clean_Developer_Handover/06_Design_References/V2_Design_Canvas_Mockup/`.

## Phase 1 — theme foundation (this commit)
- `app/v2-theme.css`: the locked V2 token set applied via `body.v2`, overriding the existing custom properties (`--bg`, `--card`, `--purple*`, rgb channels, `--glow`) so every component that reads tokens turns dark-red with zero per-component edits. Fonts need nothing: Inter + Poppins are already self-hosted and wired.
- Flag: `NEXT_PUBLIC_V2_THEME=1` at build time adds the class in `app/layout.tsx`. Build-time, not per-visitor — ISR caches one theme, cache keys unchanged. Launch = flip the env at deploy. Preview = run locally with the env set.
- Exit gate: `tsc --noEmit` clean on the founder's machine; site renders identically with the flag off.

## Phase 2 — Movie Detail template (the core, ~90% of traffic)
Same route `/movie/[id]`, same data functions, restructured per the locked design:
1. Layout shell: contained hero card inside a two-column layout; sticky sidebar (Where to Watch from the existing `buildWatch`/`watchRows` + regional-fallback note; Tonight Profile; alternative card); Related Guides at page bottom.
2. Data-gated decision modules — render ONLY when the title has reviewed data, else hide (sparse state): Tonight Verdict, Snapshot chips, What to Expect (words + 3-level dots, never numbers), Best For, CineTonight Take (byline + reviewed date + corrections link).
   - New additive Supabase table `movie_intel` (idempotent SQL in `supabase/`): title_id, verdict fields, experience labels (controlled vocabulary v1 from MOVIE_INTELLIGENCE_SYSTEM.md), take_md, editor, reviewed_at. Nothing else changes.
3. Exploration tier: director rail (from existing credits), More Like This with per-card availability + reasons (reasons editorial-gated; fall back to current TMDB recs without fake reasons), See-all tile.
4. Reviews: keep existing honest zero-state; populated member layout ships with the existing comments/ratings tables — external rating stays separately labeled (already fixed live).
5. Ticket Stub + Save stay; hero poster play-overlay opens the existing trailer modal.
- Exit gate: JS-off render shows identity+availability+links; ISR still SSG (`/movie/[id]` in build route table); tests + tsc green; golden URLs unchanged.

## Phase 3 — Series Detail (same `/movie/tmdb-t-*` route)
- Commitment panel computed from TMDB episode data we already fetch (`fetchSeasons`): released seasons/episodes, episode-length RANGE from real runtimes, approximate catch-up, status, pattern. Series-flavored verdict from `movie_intel` (same table, series rows). Season chips + spoiler-safe episode cards + upcoming clearly separated. Subscription vs store offers distinguished; no search URL labeled "Watch Now" (already fixed live).

## Phase 4 — Search + Person
- `/search`: grouped results (Movies/Series/People/Guides) on the existing `/api/search`, availability line per result, zero-result recovery (Finder/genres/trending). Stays noindex.
- `/person/[id]`: V2 layout (Start Here Tonight, filmography with roles + why-lines). STAYS `noindex,follow` + force-dynamic until the Level-A gate passes for a reviewed pilot cohort (20–50 people) — indexing flips per-cohort, later, by founder decision.

## Phase 5 — Homepage + remaining families
- Homepage V2 per canvas (fanned card-stack hero, chooser preserved — same route, same chooser logic). Then catalogue/genre/trending/provider/blog refinements per specs, one family per session, each behind the same build-time theme flag.

## Phase 6 — content pilot (parallel, founder-driven)
- Write verdict + take + experience labels for a 20–50 title Level-A cohort (start with the titles that already rank: Hallam Foe, The Skin I Live In, Repeated Love, Nando…). The template's rich state lights up per title as rows land in `movie_intel`.

## Phase 7 — launch
- Full pass: tsc, 286+ tests, predeploy-check 4/4, JS-off spot checks, golden-URL suite (all existing URLs 200/canonical unchanged), CWV spot check.
- Founder deploys with `NEXT_PUBLIC_V2_THEME=1` — the whole site turns V2 in one deploy, zero URL changes, rollback = redeploy previous version.

## Standing checklist for every phase
- [ ] No route added/renamed/removed; no sitemap change unless content honestly changed
- [ ] No new unbounded ISR surface; no fetch added to a cached route without TTL review
- [ ] Modules hide without data; nothing invented to fill space
- [ ] External vs CineTonight ratings never blur
- [ ] `npm test` green; tsc on founder's machine before any deploy
