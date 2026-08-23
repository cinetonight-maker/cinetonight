# CineTonight Dashboard — Audit Against the Management Plan, and What Happens Next

**Date:** 21 August 2026 · **LOCAL ONLY — nothing deployed**
**Reference:** your "Complete Long-Term Management System Plan"

The design image is treated as a **UX reference only** — layout, spacing and
the dark/purple language. Where it conflicts with the architecture (fake
charts, invented activity, sections we do not have), the architecture wins.

---

## Part 1 — What is already done

| Your section | State | Detail |
| --- | --- | --- |
| **1. Safety First** | ✅ **Done** | Nine binding rules in `docs/CMS-DESIGN-RULES.md`, each enforced by tests, not by good intentions |
| **2. Audit Log** | ✅ **Done** | `audit_log` + `recordAudit()`; wired to Blog, Pages, Homepage; who/what/before/after/when |
| **3. Activity Dashboard** | ✅ **Done** | `/admin/activity` — module, action, admin, date range, search; per-entry detail page; read-only, enforced by test |
| **4. Blog CMS** | 🟡 **95%** | Editor, publishing, scheduling, autosave, revisions, trash, internal links all done. **Missing: focus keyword, OG image, canonical.** |
| **5. Homepage** | 🟡 **60%** | Hero picks, section order, on/off, headings, counts, draft/preview/publish/rollback done. **Missing: hero title/description/CTA.** Quick Picks / Moods / Tonight's Pick moved to Discovery — see the decision below. |
| **6. Discovery** | ❌ **Not started** | Explore tabs, moods, quick picks, Tonight's Pick rules |
| **7. SEO** | 🟡 **25%** | Meta title/description per post and page; broken-link report; missing-metadata report. **Missing: global defaults screen, redirects, noindex rules, sitemap control.** |
| **8. Media** | 🟡 **40%** | Upload, list, pick, delete (legacy screen). **Missing: storage usage, unused-file detection, no preview/history/audit.** |
| **9. Site Settings** | 🟡 **40%** | Title, description, social, contact (legacy screen). **Missing: logo/branding, newsletter, footer editing, and the safety rules.** |
| **10. Health** | 🟡 **35%** | Database, TMDB response, last sync, build id on Overview. **Missing: R2 usage, recent errors, failed syncs, broken content, own screen.** |

### One decision I made that differs from your document

Your plan lists **Quick Picks, Moods and Tonight's Pick** under *Homepage* (§5)
and again under *Discovery* (§6). Building them twice would give two places to
change the same thing — the fastest way to make a dashboard untrustworthy.

**They live in Discovery, once.** The Homepage manager keeps what is genuinely
about the homepage: hero copy, section order, on/off, headings, counts. This
matches how the code is already organised (`lib/moods.ts`, `lib/quickPicks.ts`
and `/api/mood` are one engine shared by the homepage and `/discover`), so one
screen edits one engine.

---

## Part 2 — Build order, and why

Ranked by **your own** priorities: daily problems first, then safety, then code
dependency, then SEO.

| # | Module | Why here |
| --- | --- | --- |
| **6** | **Discovery Manager** | The only remaining thing that still needs *me* for a routine change. Changing a mood label today means editing `lib/moods.ts` and redeploying. Highest daily value. |
| **7** | **SEO & Redirects** | Safety. Renaming a page slug already breaks every link to it — Internal Links reports the damage, but there is no way to *fix* it without code. Redirects close that hole. Global defaults and the blog's focus keyword / OG / canonical land here too. |
| **8** | **Media & Storage** | Cost. R2 is the bill that already bit once. Unused-file detection and a real storage figure are the controls. |
| **9** | **Site Settings** | Branding, footer, social, newsletter — rebuilt to the safety rules (draft, preview, history, audit) rather than the raw form it is today. |
| **10** | **Health Dashboard** | Genuinely useful, but only after there are more things worth monitoring. |
| **11** | **Catalogue+** | Works today. Bulk actions and better search are convenience, not operational need. Last. |
| **12** | **Full regression audit** | Before anything is deployed. |

Small gaps folded into their nearest stage rather than given their own:
hero copy → Stage 6 batch, blog SEO fields → Stage 7.

### What I am deliberately NOT building

- **Custom moods / custom quick picks.** Your document says it, and the
  architecture requires it: mood ids are cache keys. `/api/mood`'s cardinality
  is proven bounded at 1,620 combinations. A free-text mood field reopens an
  unbounded key space — the `/person/*` mistake again.
- **Forcing an individual film as Tonight's Pick.** You ruled this out and you
  were right: a hard-coded film goes stale and the "why it fits" line becomes a
  lie. Rules only.
- **A pixel-perfect homepage preview.** It would fire the homepage's whole TMDB
  workload on every preview. Structure preview instead — documented.
- **Anything that adds a query to the public homepage.** The one-TMDB-request
  budget is not negotiable.

---

## Part 3 — Stage 6 pre-implementation brief

### 1. Design decision

Discovery is a **configuration manager** like the Homepage: one row with
`live_config` and `draft_config`, a revisions table, an audit row per publish.

It edits **presentation and availability only**:

| Editable | Locked |
| --- | --- |
| Mood label, emoji, order, on/off | Mood **id** and its genre rules |
| Quick Pick label, sub-line, icon, order, on/off | Quick Pick **id** and its rating/runtime/votes constraints |
| Explore tab label, order, on/off, which is default | Tab **ids** and the industry classifier |
| Tonight's Pick **rules** — preferred mood, minimum rating, movies/series/either | Any single forced film |

Ids are never editable because **the id is the cache key**. The genre and
rating rules are never editable because they are what makes the "why it fits"
line on a recommendation truthful — a mood whose rules no longer match its
label would make the site lie to a reader.

**A disabled mood still validates at the API.** Turning a mood off hides it
from the homepage but keeps `/api/mood?mood=<id>` working, so an old bookmark
or a shared link does not 404 — and, importantly, the cache-key space stays
*identical* whether a mood is on or off. Disabling can never change
cardinality.

**At least one of each must stay on.** Publishing a discovery config with zero
moods, zero quick picks or zero explore tabs is refused: it would leave the
decision engine with nothing to offer, which is the whole point of the page.

### 2. Database changes

```sql
discovery_config     id=1 · live_config jsonb · draft_config jsonb
                     draft_saved_at · published_at · published_by
discovery_revisions  id · config jsonb · note · author · created_at
```

Same shape as `homepage_config`. Public read policy on the config row (the site
renders from `live_config`); revisions admin-only. Additive, idempotent,
changes no existing data. `lib/moods.ts` and `lib/quickPicks.ts` stay as the
source of ids and rules — the config only *decorates and orders* them.

### 3. Risk assessment

| Risk | Mitigation |
| --- | --- |
| Config could hide everything and break discovery | `validateConfig` refuses to publish zero moods / picks / tabs |
| A stored value could be malformed and break the page | `normalizeConfig` forces any input into a renderable shape; unknown ids dropped, missing ids appended, labels length-bounded. Falls back to the locked defaults on any read problem |
| Cache-key space could widen | Ids come only from the locked arrays; no user string ever reaches a URL. Unit-tested |
| An unpublished edit could reach visitors | Separate `draft_config` column, never read by public code |
| A publish could trigger a large regeneration | Plan is `cms:discovery` + `/` + `/discover` — two routes, asserted by the blast-radius test |
| Rollback could publish something unpreviewed | Rollback loads as a **draft**; publishing stays a separate deliberate click |

### 4. Performance impact

**Zero extra public queries.** The homepage and `/discover` already call
`getSiteConfig()`-style reads; the discovery config is one more small tagged
read on the same 30-minute tier, React-cached per render, and it replaces
nothing that was cheaper. No TMDB call is added. The mood/quick-pick engine is
untouched — the config only decides which entries are shown and in what order,
which is array filtering in memory.

R2: one route rebuild for `/` and one for `/discover` per publish.

### 5. Testing plan

- `normalizeConfig` against `null`, `""`, `0`, `[]`, unknown ids, duplicate
  ids, missing ids, over-long labels — must always return a renderable config
- disabled entries never removed from the id space (cardinality unchanged)
- validation refuses zero moods, zero picks, zero tabs
- order respected; default explore tab must be an enabled tab
- revalidation plan is exactly `cms:discovery` + `/` + `/discover`
- blast-radius test extended to include the discovery plan
- ids and rules unreachable from the config type (compile-level)
- full suite, `tsc`, `next build`, OpenNext build, predeploy gate

---

*Nothing has been deployed. `enableCacheInterception` remains `false`. Existing
Phase 1 R2/OpenNext cache architecture is preserved; a filtered CMS-only D1 tag
invalidation layer was added — see docs/CMS-CACHE-LAYER-AUDIT.md.*
