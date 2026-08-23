# CineTonight CMS — Design Rules and Module Blueprint

**Date:** 21 August 2026 · **Status:** binding for Stages 5–12
**LOCAL ONLY — not deployed.** Stage 5 not started.

This is the contract every remaining module is built against. If a stage cannot
meet a rule, that is a finding to report — not a rule to quietly drop.

---

## Part 1 — Is the publish flow what you asked for?

### Draft = never public — **YES, unconditionally**

Not a policy, a structural fact. Drafts live in different database columns
(`draft_body` / `draft_content`) from the ones the public site reads
(`body` / `content`). Autosave writes only the draft columns. A draft cannot
reach a visitor even if every other guard failed.

Guards: separate columns · `planFor({kind:"none"})` returns an empty plan ·
a source-level test fails the build if an autosave branch ever gains a
revalidation call or writes a public column · both branches return
`revalidated: null` so the contract is observable.

### Preview = instant — **YES, unconditionally**

`/admin/preview/blog/<slug>` and `/admin/preview/page/<slug>` are
`force-dynamic`, admin-only and `noindex`. They read the database directly with
no cache at any layer. What they show is what is stored, at that second.

### Publish = live refresh within seconds — **CONDITIONAL. Read this.**

The mechanism is built and proven in the real worker runtime. Whether you
actually get "seconds" depends on two setup steps **that are not done yet**:

| Setup state | What Publish does | Time to live |
| --- | --- | --- |
| D1 created **and** purge token set | data + route caches expired, edge copy purged for those exact URLs | **seconds** |
| D1 created, no purge token | data + route caches expired; Cloudflare's edge copy expires on its own | seconds for a fresh edge, otherwise up to the existing `s-maxage` (1 h on `/blog/*`) |
| Neither (**today**) | tag store disabled, falls back to plain TTL expiry | unchanged from before — up to 30 min |

**To get the guarantee:**

1. `npx wrangler d1 create cinetonight-tags` → paste the id into
   `wrangler.jsonc` over `REPLACE_WITH_D1_DATABASE_ID`.
2. Cloudflare API token, scoped **Zone → Cache Purge → Purge**, cinetonight.com
   only. Set as Worker secrets `CACHE_PURGE_ZONE_ID` and
   `CACHE_PURGE_API_TOKEN`.

Until then the dashboard tells the truth rather than pretending: it says
*"Saved and published. Cache refresh is catching up — the live page may take a
few minutes."* Once the purge is configured it says *"The live page is updated
now."*

**One honest limit.** The publish path is verified by types, 96 tests, a clean
OpenNext build, and a real-worker run of the revalidation mechanism against a
local D1. It has **not** been exercised end-to-end against your live Supabase,
because I cannot sign in to your admin. That is the one thing your testing has
to cover, and it is step 1 of the review guide.

---

## Part 2 — CMS-wide design rules

Applies to every module from Stage 5 onward.

### Rule 1 — Every editable module has a preview

Preview reads the database directly, uncached, admin-only, `noindex`. It shows
the *draft* state where a module has one, and it is reachable from the editor
in one click. No module may ship where the only way to check a change is to
publish it.

### Rule 2 — Every destructive action confirms first

Confirmation states **what is lost and whether it is reversible**, in plain
words. "Delete?" is not acceptable; "Move to Trash? It comes off the site
straight away, and you can put it back" is.

Reversible (Trash) and irreversible (Delete forever) are separate actions with
separate buttons. Irreversible ones say so.

### Rule 3 — Every major module has rollback / history

A snapshot is written **before** any change to something that was public.
Restoring writes a new snapshot first, so a restore is itself undoable —
history only ever grows and is never trimmed by an action the author takes.

A restore never changes status, schedule or address. It restores content only,
so it can never silently republish or move something.

### Rule 4 — Drafts must never affect the public cache

Draft state lives in its own columns. Draft-only writes produce an empty
revalidation plan: no tags, no paths, no CDN purge, and not even the extra
lookup query. Enforced by unit tests and by a source-level test that reads the
route files.

### Rule 5 — A failed cache refresh is never reported as a failed save

Once the database write succeeds, the author is told it succeeded. Cache
freshness is reported as a separate sentence, never as an error. Revalidation
code cannot throw into the save path.

### Rule 6 — Real data or an honest blank

No sample numbers, no invented history, no decorative charts. A value that
cannot be read renders as "—" and a chart that cannot be computed is not drawn.

### Rule 7 — Admin JavaScript never reaches a public page

Admin screens live only under `/admin`. Verified against the build manifest
after every change.

### Rule 8 — Every publish, delete, restore and settings change is logged

One row in `audit_log` per action: **who** (the signed-in admin's email, taken
from their own session — never from the request body), **what** (module +
verb), **which thing** (id and the name it had at the time), **before/after**,
and **when**.

Three properties, each tested:

- **It cannot break a save.** The write has already succeeded; a failed log
  row is swallowed and logged to the console, never shown as a failed save.
- **It is bounded.** Long text becomes a `<5,000 chars · 4dda656d>` marker —
  a size *and a content fingerprint*, so an edit that keeps the same length is
  still detected. Secrets are redacted, draft columns are never recorded, and
  one snapshot is capped at 4 KB. The full content lives in the module's
  revisions table, which is what a rollback reads.
- **It is append-only.** `/api/admin/activity` is read-only: no POST, PUT or
  DELETE. A log an admin can quietly rewrite is not a log.

**Not logged:** autosave and draft discard. They never reach the public site,
fire every twenty seconds while typing, and would bury the entries that matter.

**Searchable.** `/admin/activity` filters by module, action, admin, date range
(today / 7 / 30 / 90 days / custom) and free-text over the item name and note.
All filters combine, all are applied server-side, and pagination survives them.
The action and admin dropdowns are built from the values actually present in
the log, not a hard-coded list. Unknown module/action values are dropped rather
than forwarded, and the search term is stripped of the characters that would
break out of PostgREST's filter grammar — both unit-tested.

Every new module must call `recordAudit()` on publish, delete, restore and
settings changes. A module that does not is not finished.

### Rule 9 — Bounded cache keys, always

Nothing visitor-controlled may become a cache key, a tag, or a database row.
This is the rule the `/person/*` incident was born from, and it governs every
new module.

### Compliance today

| Module | Preview | Confirm | History | Draft isolation | Audit log |
| --- | --- | --- | --- | --- | --- |
| Blog Posts | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pages | ✅ | ✅ | ✅ | ✅ | ✅ |
| Internal Links | n/a — read-only | n/a | n/a | n/a | n/a |
| Overview | n/a — read-only | n/a | n/a | n/a | n/a |
| Activity Log | n/a — read-only | n/a | n/a | n/a | n/a |
| Legacy tabs (Homepage, Catalogue, Free Movies, Media, Navigation, Sync, Comments, Settings) | ❌ | ✅ | ❌ | ❌ | ❌ |

**Two gaps this review found and closed:**

1. **Pages had no version history** while blog posts did — a direct breach of
   Rule 3. Added: `page_revisions` table, `/api/admin/pages/revisions`,
   snapshots on publish/update/trash/permanent-delete, and a History panel with
   Restore.
2. **Deleting a comment had no confirmation** and was permanent — a breach of
   Rule 2. It now confirms and says the deletion cannot be undone.

The legacy tabs remain non-compliant by design; each becomes compliant when its
own stage rebuilds it. That is the purpose of Stages 5–11.

---

## Part 3 — Blueprint: configuration managers, not database editors

Every remaining module is a **configuration manager**. The difference matters:

> A database editor changes the live site the moment you type.
> A configuration manager holds a **live version** and a **draft version**, lets
> you preview the draft, and only swaps them when you press Publish.

That gives every module the same five verbs, so the whole dashboard behaves the
same way and any of it can be undone.

### The shape

| Verb | Meaning |
| --- | --- |
| **Current live version** | What visitors see right now. Read-only in the editor. |
| **Draft changes** | Your edits, stored separately. Invisible to visitors. Autosaved. |
| **Preview** | The draft rendered exactly as it will look, uncached. |
| **Publish** | Draft becomes live, a snapshot of the old live version is kept, and the affected pages are surgically revalidated. |
| **Rollback** | Any previous published version restored, itself snapshotted first. |

Plus, on every one of those verbs except autosave: **one audit row** naming the
admin, the action, the before/after and the time.

### Storage pattern

One row per module holding both versions, plus a revisions table:

```
<module>_config      id · live_config jsonb · draft_config jsonb
                     draft_saved_at · published_at · published_by
<module>_revisions   id · module_id · config jsonb · note · author · created_at
audit_log            shared across every module — see supabase/audit_log.sql
```

The public site reads **`live_config` only** — the same structural guarantee
that makes blog drafts safe. Autosave writes `draft_config`; Publish copies
draft → live and snapshots the old live.

### Stage 5 — Homepage Manager

- **Current live version** — hero picks, section order, which sections are on,
  the Guides strip count.
- **Draft changes** — edit freely; nothing moves on the site.
- **Preview** — the real homepage rendered from the draft config.
- **Publish** — swaps, then revalidates `/` and nothing else.
- **Rollback** — any previous homepage, restorable in one click.

Revalidation: `/` only. Never the movie, genre or browse routes — that is the
bulk R2 regeneration the architecture forbids.

### Stage 6 — Discovery Manager

Four configuration groups, one publish action, one rollback history:

- **Mood settings** — the 8 homepage moods: label, icon, which filters each
  applies, order, on/off.
- **Quick Picks** — the 6 one-tap starting points and their order.
- **Explore tabs** — which industry tabs appear, their order, the default tab.
- **Tonight's Pick rules** — automatic (by the existing quality/discovery
  rules), manual (a chosen title), or scheduled (a title per date).

**Hard constraint carried over from Phase 3:** the mood/quick-pick/explore
value sets must stay a **closed, bounded set**. `/api/mood`'s cardinality is
proven bounded at 1,620 combinations; a free-text mood field would reopen an
unbounded cache-key space. The manager therefore edits **labels, order, on/off
and which of the existing filters apply** — it never lets a new arbitrary value
into a URL. Any change that would widen that set is a stop-and-report.

Revalidation: `/` and `/discover` only.

### Stage 7 — Catalogue+

Per-title editing stays direct (a title is its own record, not site
configuration), but gains the module rules: preview, confirm, history, Trash.
Bulk actions confirm with an exact count of what they will touch.

Revalidation: the specific `/movie/<id>` pages edited — never the whole
catalogue.

---

## Part 4 — Is the CMS foundation production safe?

**Yes, with the two setup steps in Part 1 outstanding.**

| Check | State |
| --- | --- |
| Draft can reach a visitor | Structurally impossible |
| Autosave can publish | Structurally impossible, plus 4 guards |
| A save can be lost | No — Trash is reversible, history covers published changes |
| A cache failure can look like a save failure | No — fixed in the cache-layer audit |
| Unbounded cache keys or D1 rows | No — every key derives from an admin-created slug |
| Blast radius of a publish | ≤ 3 routes, proven at runtime |
| `enableCacheInterception` | `false`, verified in the built worker |
| Admin JS in public bundles | None |
| Tests | **96 / 96** |
| Type check / build | clean |
| End-to-end publish against live Supabase | **Not verified by me — your test** |
| D1 database created | **Not done** |
| Cache purge token set | **Not done** (optional) |

Deploying before the two setup steps is safe: the tag cache disables itself and
the site behaves exactly as it does today.

---

*Stage 5 has not been started. Nothing has been deployed. Existing Phase 1
R2/OpenNext cache architecture is preserved; a filtered CMS-only D1 tag
invalidation layer was added — see docs/CMS-CACHE-LAYER-AUDIT.md.*
