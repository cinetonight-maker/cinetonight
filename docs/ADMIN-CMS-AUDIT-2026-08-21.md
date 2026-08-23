# CineTonight — Admin / CMS audit — 21 Aug 2026

**AUDIT ONLY. Nothing implemented, nothing deployed, no production change.**

---

## A. Executive summary

The admin is a **working operations panel, not yet a CMS**. Its foundations
are genuinely good — real Supabase-backed CRUD on every tab, correct
server-side auth, service-role keys never exposed to the browser, and one
save path (`site config`) that is better engineered than most hand-rolled
CMSs (it re-reads server state before every write to avoid stale
overwrites). Nothing here needs to be thrown away.

But it fails the goal you actually stated — *"operate CineTonight for months
from the dashboard alone"* — for three structural reasons:

1. **The blog body cannot express links, bold, lists or images at all.**
   Content is stored as an array of plain strings; only `## ` / `### `
   prefixes mean anything. Internal linking — your stated top requirement —
   is currently *impossible* in a post body, not merely awkward.
2. **Publishing has no cache invalidation**, so every save appears to "not
   work" for 5–30 minutes. This is the single biggest cause of the
   "saving feels unreliable" experience.
3. **The homepage is ~85% hardcoded.** Hero posters and the guides list are
   database-driven; headings, copy, Quick Picks, moods, streaming services,
   Explore tabs and newsletter text all live in code.

Current honest score: **5.5/10** — solid plumbing, missing the editor and
the management surfaces.

## B. Current admin architecture

```
/admin (page.tsx)  →  <AdminDashboard/>   ONE client component, 1,391 lines
       │                     │
       │                     └── 9 tabs, all client state, no routing per tab
       │
middleware.ts  →  Supabase session + admin_users allowlist  (server-side)
       │
       └── /api/admin/* (12 REST routes) → supabaseAdmin() service role
                                                  │
                                       Supabase (16 tables)
                                                  │
                       public site ── supabasePublic() with TTL tiers ──┘
```

**Critical architectural fact:** there is **no separate published read
model**. The public site reads the *same tables* the admin writes, filtered
at query time (`status`, `publish_at <= now`). This is acceptable at current
scale and keeps things simple, but it means a bad admin write is
immediately a public-site problem, and there is no staging layer.

## C. Section inventory

| Tab | Route/Component | Tables | Write path | Works? | Main gap |
|---|---|---|---|---|---|
| Sync Center | `SyncTab` | movies, sync_log | `/api/admin/sync` | ✅ | no schedule control |
| Hero Picks | `HeroTab` | home_config | `/api/admin/site` | ✅ | posters only, no copy |
| Blog Posts | `BlogTab` | blog_posts, blog_categories | `/api/admin/blog` | ⚠️ | editor (see F/G) |
| Catalogue | `CatalogueTab` | movies | `/api/admin/catalogue` | ✅ | no tier/quality view |
| Free Movies | `ClassicsTab` | classics | `/api/admin/classics` | ✅ | source verify is manual |
| Pages | `PagesTab` | pages | `/api/admin/pages` | ✅ | markdown, no preview |
| Menus & Footer | `MenusTab` | nav_links | `/api/admin/nav` | ⚠️ | doesn't control header/sidebar |
| Media Library | `MediaTab` | media + storage | `/api/admin/media` | ⚠️ | no alt text/resize |
| SEO & Settings | `SettingsTab` | site_settings | `/api/admin/settings` | ✅ | global only, no per-item |
| (Comments) | inside tabs | comments | `/api/admin/comments` | ✅ | no bulk moderation |

Every route is protected: middleware blocks `/admin/**` (redirect) and
`/api/admin/**` (401 JSON), then re-checks the `admin_users` allowlist and
signs out non-allowlisted accounts. **No client-only gating anywhere.**

## D. What works (keep, do not rebuild)

Auth/allowlist model · service-role isolation (`lib/supabase/admin.ts`
server-only) · the `save()` re-fetch-then-patch pattern in the dashboard
root · catalogue add/edit/refresh-from-TMDB · classics management with
source verification · media upload with MIME **and** extension allowlist ·
nav_links CRUD with ordering · sync center with sync_log · scheduled-post
support (`status: scheduled` + `publish_at`, honored by `lib/data.ts`) ·
effective-status display (a scheduled post whose time passed shows as live).

## E. What is broken or unsafe

1. **Blog validation errors were invisible** — `err` rendered only when the
   post list was empty, so a rejected save looked like a dead button.
   *(Fixed locally today; ships with the pending bundle.)*
2. **Unknown category silently blocks saving** — the post's category must
   already exist in `blog_categories`; otherwise `commit()` returns early.
3. **No cache invalidation on publish** — grep confirms zero
   `revalidatePath`/`revalidateTag` in the entire admin surface.
4. **Optimistic UI can lie** — `setSite(next)` runs before the POST
   resolves; a failed write leaves the screen showing the new value.
5. **Slug drift** — POST auto-appends `Date.now().toString(36)` on
   collision without telling you; PUT re-slugifies silently.
6. **`date_label` is free text** decoupled from `publish_at`, so the
   displayed date and the real publish moment can disagree.
7. **Pages render `marked.parse()` through `dangerouslySetInnerHTML`** —
   admin-authored so the practical risk is low, but it is a genuine XSS
   surface if an admin account is ever compromised. Blog does not have this
   risk because it renders plain text.
8. **Media accepts 15 MB uploads** with no resizing — one such image on the
   homepage would wreck LCP.

## F. Root causes of the blog/page editing problems

You asked specifically *why* it feels unreliable. The causes, in order of
impact:

- **Perceived failure = missing revalidation (cause #1).** You save, the
  live page still shows the old content for 5–30 minutes, so you assume the
  save failed and try again. Nothing is actually wrong with the write.
- **Silent validation rejects (cause #2)** — category gate and
  scheduled-without-date, both previously invisible.
- **Not autosave collisions** — there is *no* autosave at all, which is a
  different problem: closing the tab loses everything typed.
- **Not database writes** — the API routes are clean, awaited, and return
  proper errors; `supabaseAdmin()` writes succeed.
- **Editor primitiveness (cause #3)** — a bare `<textarea>` that splits on
  blank lines into `string[]`. There is no undo beyond the browser's, no
  structure feedback, and no way to see what will render.

## G. Blog CMS gaps — the highest-priority module

**Storage model today:** `body jsonb` = array of plain strings.
Rendering: `## ` → H2, `### ` → H3, everything else → `<p>` **verbatim**.

Consequences, stated plainly: **bold, italic, links, lists, blockquotes,
in-body images, captions, tables and embeds do not exist and cannot be
authored.** Internal linking is impossible in a post body today.

Meanwhile **Pages use full Markdown** via `marked`. So the site runs *two
different content models*, and the more capable one is on the less
important surface.

Fields present: title, slug, cat, excerpt, body, image_url, date_label,
read_label, status, publish_at, meta_title, meta_description.
**Missing:** author, tags, alt text for the featured image, canonical,
noindex flag, updated-at display, revision history, preview.

**Recommended editor architecture (least migration risk):** move blog
`body` to **Markdown string** — the same model Pages already use — with a
lightweight toolbar editor writing Markdown, and render through the same
`marked` pipeline plus sanitisation. Migration is mechanical
(`body.join("\n\n")`), existing `##`/`###` markers survive untouched
because they are already Markdown syntax, and it unlocks links, bold,
lists and images in one step without a rich-text JSON schema or a heavy
dependency. H1 stays reserved by simply not offering it in the toolbar.

## H. Homepage management gaps

| Section | Today | Could be admin-managed |
|---|---|---|
| Hero | posters DB (`home_config.hero.slides`); **heading/sub/CTA hardcoded** | copy + CTA labels + auto/manual mode |
| Quick Picks | hardcoded `lib/quickPicks.ts` | enable/order/label/icon (rules bounded) |
| Moods | hardcoded `lib/moods.ts` | enable/order/label/icon (genre recipes validated) |
| Tonight's Pick | algorithmic | manual/scheduled override |
| Trending | TMDB live | heading, count (bounded 8–12), show/hide |
| Streaming Services | hardcoded component | visibility + order |
| Explore Tonight | hardcoded tabs | show/hide, order, default tab |
| Guides | DB (latest 3 posts) | manual curation option |
| My List | client-side | show/hide only |
| Newsletter | hardcoded copy | heading/copy/CTA/show-hide |
| Footer | `nav_links` DB + hardcoded copy | already partly managed |

Needs a new `home_sections` (or extended `home_config`) model. All of it is
low-risk **provided** values stay allow-listed rather than free-form.

## I. Discovery management gaps

Phase 2/3 safety properties that must survive any admin control: bounded
option sets, allow-listed values, Tier C excluded from premium surfaces,
deterministic shared caching, no arbitrary/random/timestamp cache keys, no
N+1 TMDB calls, no unlimited R2 inventory.

Classification of possible controls:
- **SAFE:** enable/disable, ordering, display label, icon choice, section
  headings, show/hide, Explore default tab, Trending count within 8–12.
- **SAFE WITH VALIDATION:** mood genre recipes (must map to known TMDB
  genre names), Quick Pick numeric constraints (**must snap to the existing
  allow-lists** — runtime {60,90,120,150}, rating {6,6.5,7,7.5,8}, votes
  {1500}), Tonight's Pick manual override (must be a Tier A catalogue id),
  industry mix weights (must sum to 1, each 0–0.6).
- **KEEP IN CODE:** the tier algorithm, Bayesian formula and thresholds,
  `latestEligible` rules, cache TTLs, the classifier's precedence, any
  free-text that would become a TMDB query parameter.

## J. Catalogue gaps

Works: search, add manually, import/refresh from TMDB, edit metadata,
delete. Missing: quality-tier display, "incomplete record" warnings,
exclude-from-discovery flag, feature/pin flag, poster/backdrop override,
per-title preview link, movie/series filter, bulk actions.
Safe override level: **presentation fields** (poster, title casing,
featured flag, exclude flag) yes; **quality-signal fields** (votes, rating,
tier) no — those must stay derived, or Phase 2's guarantees become
editable fiction.

## K. Media gaps

Supabase Storage bucket `media` + `media` table. Upload validates MIME and
extension, 15 MB cap, public URL stored. **No** resizing, compression,
format conversion, alt text, dimensions, usage tracking, replace-in-place,
or search. Guardrails to add later: cap at ~2 MB after client-side
downscale, auto-convert to WebP, require alt text before an image can be
used as a featured image, and show where each image is used before allowing
deletion.

## L. Navigation gaps

`nav_links` drives the **footer** only. The header, desktop sidebar and
mobile bottom bar all read the hardcoded `NAV` array in
`components/Sidebar.tsx` (Phase 3 added `top`/`side`/`bottom`/`topOrder`
flags there). So "Menus & Footer" is currently mis-named — it cannot change
the main navigation. Ordering works for footer links; there is no URL
validation, no external-link handling, and no visibility toggle. Phase 4's
route consolidation (`/web-series` vs `/tv-shows`, series under `/movie/`)
must land **before** navigation becomes fully admin-managed, or you will be
editing links to URLs that are about to change.

## M. SEO gaps

Exists: global site title, description, and a small settings set;
per-post `meta_title` / `meta_description`. Missing: default OG image
control, per-item canonical, per-item noindex, redirect manager, sitemap
and robots status, missing-metadata warnings, 404 monitoring, Search
Console verification field. **Defer until Phase 4**: canonical, noindex,
redirects — all three depend on the URL architecture that Phase 4 changes.
Do not add meta keywords (ignored by every major engine since 2009).

## N. Publishing / save architecture

`Save post` → client validation → `POST|PUT /api/admin/blog` →
`supabaseAdmin()` write → on success `setEditing(null); load()`.
No revalidation, no optimistic-failure rollback, no preview step, no
conflict detection (two tabs = last-write-wins, silently).
`Save` on site config is the strong path (re-fetch → patch → write).
`Delete` uses `confirm()` and hard-deletes — no trash.

## O. Draft / preview / revision

| Capability | Today |
|---|---|
| Drafts | ✅ `status: draft` |
| Scheduled publishing | ✅ `publish_at`, honored publicly |
| Preview | ❌ none |
| Autosave | ❌ none (work lost on tab close) |
| Revisions | ❌ none |
| Rollback | ❌ none |
| Trash / soft delete | ❌ hard delete |

Smallest robust future architecture: add `blog_revisions` (post_id,
snapshot jsonb, created_at, author) written on every publish; add
`deleted_at` for soft delete; autosave writes **only** to a `draft_body`
column and never touches `status` — matching your rule that autosave must
never publish.

## P. Auth / security findings

**Good:** middleware enforces auth server-side on every `/admin/**` and
`/api/admin/**` request; `admin_users` allowlist checked on *both* the page
and API paths; non-allowlisted users are signed out rather than left in a
half-state; service-role key used only in server modules; Supabase session
cookie forced `httpOnly` + `secure` (a deliberate hardening over
`@supabase/ssr`'s default); 26 RLS policies present; rate limiting exists
on public APIs; `/admin` is `X-Robots-Tag: noindex` and disallowed in
robots.txt and excluded from the sitemap.

**To improve:** no CSRF token (mitigated by same-site cookies + JSON
content-type, but worth adding for destructive routes); no rate limiting on
admin routes; destructive actions use browser `confirm()` only; single
role (admin/not-admin) with no editor/author distinction; uploaded files
are served from Supabase public storage with no virus/content scanning;
`dangerouslySetInnerHTML` on pages (see E7).

## Q. Database architecture

16 tables. Admin-relevant: `blog_posts`, `blog_categories`, `pages`,
`movies`, `classics`, `home_config` (single row, id=1), `nav_links`,
`media`, `site_settings`, `admin_users`, `sync_log`, `comments`.
Public-facing reads go through `supabasePublic()` with the Phase 1 TTL
tiers (stable 24h / catalogue 6h / default 30m).

**Answer to your architecture question:** the public site **reads the admin
tables directly** — there is no validated published read model in between.
The filtering that makes it safe (status, publish_at) happens in the query.
This is fine now; if the CMS grows, the right evolution is a published
snapshot (e.g. a `published_home` row assembled on save) so the public site
reads one small, pre-validated document instead of several live tables.

## R. Public performance / cache impact

Admin JS does **not** ship to visitors — `AdminDashboard` is imported only
by `/admin`, and Next code-splits per route (verified: homepage chunks do
not include it). Homepage costs 2 Supabase reads regardless of admin
activity. No admin-driven N+1, no cache fragmentation, no dynamic rendering
forced by admin data. **The current admin is performance-neutral for
visitors, and any future CMS must preserve that**: the public read model
must stay small and cached; new admin-managed config must join the existing
`home_config` read rather than adding queries.

## S. System Health feasibility

Safely obtainable today, server-side, no secrets exposed: build ID
(`OPEN_NEXT_BUILD_ID` / `BUILD_ID` file), last sync (`sync_log`), Supabase
reachability (a trivial query), TMDB reachability (one cheap cached call),
counts of posts/drafts/scheduled/catalogue, recent admin errors if we start
logging them. **Not safely obtainable without new secrets:** R2 object
count and Cloudflare metrics — they need a Cloudflare API token stored in
the app, which widens the blast radius considerably. Recommendation: show
everything except R2/Cloudflare, and keep those as a manual CLI check.

## T. UX / design findings

The horizontal tab strip (9 tabs) already wraps awkwardly and cannot hold
the ~18 sections a real CMS needs — confirmed structural blocker. Other
findings: all tabs live in one 1,391-line component with no per-tab routing
(no deep links, no browser back, state lost on tab switch); the dashboard
was left-aligned on wide screens (*fixed locally today*); forms are flat
label/input stacks with little grouping; button hierarchy is inconsistent
(primary "Save" appears both in panel headers and in card footers); status
feedback is a single global pill; empty and loading states exist but are
plain; tables are simple rows without sorting or filtering; the dashboard
is barely usable below ~900px.

## U. Accessibility findings

Present: real `<button>`/`<label>` elements, `aria-label` on icon-only
controls, `disabled` states during writes, focus-visible styles inherited
site-wide. Missing: the tab strip is plain buttons without
`role="tablist"`/`aria-selected`; reorder controls (↑/↓) have labels but no
live-region announcement; `confirm()` dialogs are not focus-managed; form
errors are not linked to inputs via `aria-describedby`; no skip link; some
muted helper text is below 4.5:1 contrast.

## V. Green / Amber / Red classification

**GREEN — safe dashboard controls:** post/page body and metadata, featured
image choice, excerpt, category, tags, publish status and schedule, section
headings and copy, CTA labels, show/hide toggles, ordering (menus, quick
picks, moods, providers, explore tabs), hero poster selection, guide
curation, catalogue presentation fields, media upload with guardrails,
site title/description/OG image.

**AMBER — allowed only with hard validation:** slug (uniqueness + format +
warn on change of a published post), mood genre recipes (allow-listed genre
names), Quick Pick numeric constraints (must snap to existing allow-lists),
industry mix weights (bounded, must total 100%), Trending item count
(8–12), Tonight's Pick manual override (Tier A ids only), redirects
(loop/format validation, Phase 4+), canonical and noindex (Phase 4+).

**RED — must stay code/infrastructure:** OpenNext config, R2 cache
architecture and TTLs, Cloudflare rules and cache behavior, environment
secrets and API keys, middleware, database migrations, the Phase 2 quality
algorithms (tier rules, Bayesian formula, latestEligible), the industry
classifier precedence, rate-limit thresholds, robots.txt crawler rules
(they interact with cost and indexing), anything that becomes a raw TMDB
query parameter.

## W. Recommended admin information architecture

Replace the tab strip with a **left sidebar + sub-navigation**, one route
per section (`/admin/content/blog`, `/admin/homepage`, …) so each screen is
deep-linkable and state survives navigation:

```
Overview
Homepage          (hero, sections, ordering)
Content           → Blog Posts · Pages
Catalogue         → Movies & Series · Free Movies
Discovery         → Tonight's Pick · Quick Picks · Moods · Explore · Providers
Media
Navigation        → Header · Sidebar · Footer        [after Phase 4]
SEO                                                   [partly after Phase 4]
Scheduling
System Health
Settings
```

Backend support today: Content ✅, Catalogue ✅, Media ✅, Settings ✅,
Navigation ⚠️ (footer only), Homepage ⚠️ (hero only), Discovery ❌,
Overview ❌, Scheduling ⚠️ (exists per-post, no calendar), Health ❌.

## X. Recommended implementation phases

1. **Blog CMS core** — Markdown migration, toolbar editor (H2/H3/H4, bold,
   italic, lists, quote, link, image, undo/redo, word count, reading time),
   preview, autosave-to-draft, revisions + rollback, soft delete. *Plus the
   revalidation fix so saves appear immediately.*
2. **Internal link picker** — search across blog_posts, pages, movies,
   classics; insert correct internal URL. Depends on (1) because links
   cannot exist in the body until Markdown lands.
3. **Admin shell** — sidebar IA, per-section routes, split the 1,391-line
   component, responsive layout, a11y pass.
4. **Homepage manager** — headings/copy/CTAs, show-hide, ordering, hero
   modes, guide curation (new `home_sections` model).
5. **Discovery manager** — enable/order/label for moods, quick picks,
   explore tabs, providers; Tonight's Pick override — all allow-listed.
6. **Catalogue+ / Media guardrails** — tier display, exclude flags, alt
   text, auto-resize, usage tracking.
7. **Overview + System Health.**
8. **SEO manager** — after Phase 4 settles URLs.

## Y. Risks and dependencies

- **Phase 4 (SEO/URLs) blocks** navigation management, canonical, noindex
  and redirects. Building them first means rework.
- **Markdown migration** touches every existing post — needs a reversible
  script and a full-content diff check (low risk: `join("\n\n")` is
  lossless, and `##` markers are already valid Markdown).
- **Sanitisation is mandatory** when blog bodies start rendering HTML.
- **Revalidation must be surgical** — per-path on publish, never a blanket
  purge (Phase 1 rule).
- **Config payload discipline** — homepage config must stay one small
  cached read; a fat JSON blob would tax every visitor.
- **Two pending deploys** (Phases 2+3, plus today's dashboard fixes) should
  ship before CMS work begins, so the baseline is what's actually live.

## Z. Final recommendation

Keep the foundations, replace the editor. Start with **Blog CMS core plus
the revalidation fix** — that single module removes both of your daily pain
points (unreliable-feeling saves, primitive editing) and unblocks internal
linking, which is the feature you named as most important. Do not touch
navigation or SEO management until Phase 4 URL work is done. Every new
control ships allow-listed, never free-form, so Phase 2/3 guarantees and
Phase 1 cost control remain intact.
