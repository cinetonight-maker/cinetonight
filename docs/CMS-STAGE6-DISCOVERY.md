# Stage 6 — Discovery Manager

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed**

`tsc` clean · `npm test` **166 / 166** (21 new) · `next build` OK ·
`opennextjs-cloudflare build` OK · predeploy gate **4/4** ·
`enableCacheInterception` still `false` · no admin JS in any public bundle ·
**every public route's revalidate tier unchanged** (see §5).

This closes the last thing that still needed me for a routine change. Changing
a mood label used to mean editing `lib/moods.ts` and redeploying.

---

## 1. What you can now change

**Moods** — label, emoji, order, on/off
**Quick Picks** — label, the line underneath, icon, order, on/off
**Explore Tonight** — tab labels, order, on/off, and which tab opens first
**Tonight's Pick** — the *rules*: lean toward a mood, a minimum rating, films
or series or either

All of it draft → preview → publish → rollback, with an audit row per publish.
Both `/` and `/discover` follow the config; edit once, both update.

## 2. What is locked, and why

| Locked | Reason |
| --- | --- |
| Every id (`happy`, `date-night`, `korean`…) | **The id is the cache key.** `/api/mood` and `/api/explore` validate against these closed lists; that is what keeps the key space provably bounded at 1,620 combinations. A field that could mint a new id reopens an unbounded space — the `/person/*` mistake that cost real money. |
| Genre, rating, runtime and vote rules | **They are what make the site honest.** A recommendation's "why it fits" line is generated from a mood's real rules. Rename "Dark" to "Family Night" while the rules still pick crime thrillers and the site starts lying to readers. |
| Forcing one specific film as Tonight's Pick | You ruled it out and the architecture agrees: a pinned film goes stale within days and makes that same line untrue. Rules only. |

The screen **shows** each locked rule under the row it belongs to. A control
that hides its own constraints is worse than one that has none.

### Switching something off cannot change the cache

A disabled mood disappears from the picker but **still validates at the API**,
so an old bookmark or a shared link keeps working — and the key space is
identical whether an entry is on or off. There is a test that asserts exactly
this, because it is the property the whole design rests on.

## 3. What cannot go wrong

- **Draft never reaches a visitor** — `live_config` and `draft_config` are
  different columns; public code reads only the first.
- **Nothing can empty the picker** — publishing with zero moods, zero Quick
  Picks or zero tabs is refused. A default tab that is switched off is moved
  automatically to one that is on.
- **Garbage cannot break the page** — `normalizeConfig` was tested against
  `null`, `""`, `0`, `[]`, unknown ids, duplicate ids, missing ids, over-long
  labels and a hand-edited row trying to smuggle in genre rules. It always
  returns something renderable, and any read problem falls back to the shipped
  default.
- **Rollback loads as a draft**, never straight to the site.

## 4. Database

```sql
discovery_config     id=1 · live_config · draft_config · draft_saved_at
                     published_at · published_by
discovery_revisions  id · config · note · author · created_at
```

Additive and idempotent. `lib/moods.ts` and `lib/quickPicks.ts` are untouched
and remain the source of ids and rules — the config only decorates and orders
them.

## 5. Performance — and a regression I caught and fixed

Publishing invalidates `cms:discovery` + `/` + `/discover`. **Two routes, two
rebuilds.** Asserted by the blast-radius test alongside blog, pages and
homepage.

**The regression:** I first put the config read on the 30-minute tier. Next
sets a route's effective revalidate to the *minimum* of its own setting and
every fetch inside it — so that one read dragged `/discover` from a **1-day**
ceiling down to **30 minutes**: 48× more R2 writes on that route, for a value
that only changes when someone presses Publish. The build output showed it
(`/discover 1d → 30m`).

Fixed by moving both the discovery and homepage config reads to the 24-hour
tier. The build now prints `/discover 1d` again, and **every public route's
revalidate is exactly what it was before this stage.** The tag is what makes a
publish appear immediately; the TTL is only the quiet-period fallback.

This is the same trap `lib/supabase/public.ts` documents from the Phase 1 work.
It is worth knowing it is still live: any new fetch added to a page silently
becomes that page's cache ceiling.

## 6. Files

**New:** `lib/discoveryConfig.ts` · `lib/discovery.ts` ·
`supabase/discovery_cms.sql` · `app/api/admin/discovery/route.ts` ·
`components/admin/DiscoveryManager.tsx` ·
`app/admin/preview/discovery/page.tsx` · `tests/discoveryConfig.test.mjs`

**Changed:** `app/page.tsx` · `app/discover/page.tsx` ·
`components/home/PickStudio.tsx` · `components/home/ExploreTabs.tsx` ·
`lib/revalidatePlan.ts` · `lib/homepage.ts` · `lib/adminNav.ts` ·
`app/admin/[section]/page.tsx` · `app/globals.css` ·
`tests/revalidatePlan.test.mjs`

The five "Soon" rows under Discovery collapse into one working **Discovery**
screen; Streaming Services stays planned.

## 7. To try it

1. Run `supabase/discovery_cms.sql` in Supabase → SQL Editor.
2. `/admin/discovery` — rename a mood, reorder Quick Picks, switch a tab off.
   **Check the homepage: nothing has changed.**
3. **Preview draft**, then **Publish**, then look at `/` and `/discover`.
4. **History** → load the previous version as a draft → preview → publish.
5. `/admin/activity` → the publish entry, with before/after.

---

*Nothing has been deployed. `enableCacheInterception` remains `false`. Existing
Phase 1 R2/OpenNext cache architecture is preserved; a filtered CMS-only D1 tag
invalidation layer was added — see docs/CMS-CACHE-LAYER-AUDIT.md.*
