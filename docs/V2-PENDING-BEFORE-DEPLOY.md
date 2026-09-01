# V2 — PENDING BEFORE DEPLOY (do not deploy until every box is ticked)

Status 1 Sep 2026: all V2 code is BUILT and committed on branch `v2`.
The live site is untouched and stays frozen. Deploy is deliberately
POSTPONED by the founder. This file is the single checklist of what
remains; tick items here as they complete.

## Founder sign-off (nobody else can do these)
- [ ] Review + run intel batch 1: `supabase/drafts-intel-batch-1.sql`
      (read all 6 entries, edit wording freely, paste into Supabase SQL
      editor, Run — safe to re-run). Batch 2 (remaining 5 catalogue
      titles) to follow the same flow.
- [ ] Full local preview with `NEXT_PUBLIC_V2_THEME=1` in `.env.local`:
      homepage, a movie page (rich + sparse), a series, search, person,
      listings, channel, blog. Sign off or request changes.
- [ ] `npx tsc --noEmit` on the founder's Windows machine (TS7 native).
- [ ] Decide the uncommitted accent-picker experiment (globals.css,
      Header.tsx, Icon.tsx, BrandMark.tsx, AccentPicker.tsx): commit or
      discard. The working tree must be clean before the release build.

## Phase 7 launch checks (run all AFTER the above, BEFORE deploy)
> DRY RUN 1 Sep 2026 (container mirror, V2 flag on): predeploy-check 4/4,
> golden-URL sweep all 200 (junk 404s, /p/* 308s correct), canonicals
> present, JS-off movie page renders identity + availability + honest
> rating label. Re-run everything on the founder's machine before the
> real deploy — the boxes below stay unticked until then.
- [ ] `npm test` — 286/286.
- [ ] `npm run predeploy-check` — 4/4.
- [ ] Golden-URL suite: every existing URL still 200 with unchanged
      canonicals; no route added/renamed/removed.
- [ ] JS-off spot checks: movie page shows identity + availability +
      links without JavaScript.
- [ ] Build route table: `/movie/[id]` still SSG (3d revalidate);
      person/blog/[slug]/[slug] still force-dynamic.
- [ ] CWV spot check on the built pages.

## The deploy itself (founder only)
Set `NEXT_PUBLIC_V2_THEME=1` in the production environment and deploy
once — the entire site flips to V2 in that single deploy. Zero URL
changes. Rollback = redeploy the previous version (or unset the flag).

## Standing law (see 00_Project_Control/DECISIONS_AND_OPEN_QUESTIONS.md)
- URL FREEZE: never create a new movie URL — new titles use tmdb-*
  addresses; existing clean URLs never removed without a redirect.
- Live site frozen; only the founder deploys.
- No new unbounded ISR surfaces; enableCacheInterception stays false.
