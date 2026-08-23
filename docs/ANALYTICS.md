# CineTonight analytics foundation — implementation report

**Code complete: 19 Aug 2026.** Ships with the Phase 1 final candidate in ONE
deploy. Record the deployment timestamp in docs/PHASE1-FINAL.md §G — the same
timestamp governs both the Cloudflare measurement windows and GA4 validation.

---

## A. Existing analytics audit

GA4 already existed: a gtag snippet in `app/layout.tsx` (loads only when
`NEXT_PUBLIC_GA_ID` is set, `afterInteractive`, client-only) plus a thin
`track()` wrapper in `lib/analytics.ts` used by five homepage components. No
Firebase, no GTM, no consent system, no duplicate tags. Pageviews fired only
on initial document load — client-side navigations were invisible. Nothing
was removed; the existing tag and property are REUSED.

**The headline decision: no Firebase SDK was added — deliberately.**
Firebase Analytics for web is the same GA4 measurement underneath. Adding
`firebase/app` + `firebase/analytics` on top of the working gtag stream would
double-initialize the same data stream (the duplicate-tag situation the brief
warns against in §1) and add ~35 KB of JavaScript for zero additional data.
Every requirement — client-only capture, consent mode, typed events,
sanitization, taxonomies, R2 safety — is implemented on the existing tag.
The Firebase env-var list in the brief is therefore NOT needed; the only
variable is the existing `NEXT_PUBLIC_GA_ID`. The event dictionary transfers
unchanged if a Firebase-gated product is ever genuinely required.

## B. Setup — files created/changed

New: `components/AnalyticsPageViews.tsx` (single page_view source),
`components/PrivacyChoices.tsx` (footer opt-out), `components/GuideLink.tsx`
(guide click tracking). Rewritten: `lib/analytics.ts` (consent, sanitizer,
taxonomies, typed events). Wired: `app/layout.tsx` (consent defaults,
`send_page_view:false`), `components/home/{PickStudio,HeroActions,ExploreTabs}`,
`components/{WhereToWatch,WatchlistButton,TicketStub,SearchBox,SignInForm,
SignUpForm,BlogSection,MovieDetail,Footer}`, `lib/watchlist.ts` (confirmed-
success callback), `app/page.tsx` (surface prop), `app/globals.css`.
Packages added: none. Env vars required: `NEXT_PUBLIC_GA_ID` (already set).

## C. Page-view strategy

Automatic GA4 page measurement is OFF (`send_page_view: false`).
`AnalyticsPageViews` (mounted in the layout, inside Suspense) is the only
page_view source: it watches pathname + searchParams and fires once per real
URL change. Duplicates are impossible by construction: one source, guarded by
a last-URL ref (also covers Strict Mode double-effects and redirect chains
landing on the same URL). Query params are stripped except `genre` (bounded,
content-changing) — `?q=`, page numbers and junk never enter page_path, while
GA still reads UTM/campaign params itself from the real URL, so acquisition
reporting is unaffected.

## D. Consent architecture

Google Consent Mode, set in the dataLayer before the tag processes anything:

- **Advertising** (`ad_storage`, `ad_user_data`, `ad_personalization`):
  **denied always, everywhere** — this is an analytics deployment, not ads.
- **`analytics_storage`**: an explicit stored user choice wins globally.
  With no stored choice: denied by default in EEA/UK/CH (region list),
  granted elsewhere — appropriate for an India-first site with no ads.
- **Opt-out**: a plain, equal-weight footer control ("Anonymous usage
  analytics: on/off"). Granting fires a consent update immediately; denying
  fires the update, arms Google's documented `ga-disable-<ID>` kill switch,
  AND makes every `track()` call a hard no-op — all without a page refresh.
- **Withdrawal honesty**: withdrawal stops all future collection. Already-
  collected data remains in GA under its retention settings; the
  implementation does not claim to delete it (users can clear `_ga` cookies
  in their browser). No dark patterns; no banner spam.

## E. Event dictionary

| Event | Trigger (success boundary) | Params | Type | Key event? |
|---|---|---|---|---|
| `page_view` | one per real URL change | page_path/location/title | standard | no |
| `picker_started` | "Pick something for me" click | surface | custom | no |
| `mood_selected` | mood tile selected | mood, surface, media_type | custom | no |
| `quick_pick_selected` | quick pick selected | quick_pick, surface | custom | no |
| `media_type_selected` | Films/Series toggle | media_type, surface | custom | no |
| `recommendation_viewed` | a result actually renders (seed once; each successful pool load) | surface, recommendation_source, media_type, mood, quick_pick, tmdb_id | custom | maybe later |
| `recommendation_failed` | API returned nothing / network error | failure_type, surface | custom | no |
| `another_pick` | next-pick click | surface, attempt_number, recommendation_source | custom | no |
| `provider_clicked` | Where-to-Watch link CLICK | provider, surface, media_type, tmdb_id | custom | **YES** |
| `trailer_played` | user clicks play | surface, media_type, tmdb_id | custom | no |
| `watchlist_added` / `_removed` | AFTER save confirmed (immediate for anonymous localStorage; after the Supabase write resolves for signed-in) | surface, media_type, tmdb_id | custom | **YES** (added) |
| `ticket_created` | ticket canvas actually rendered (once per title per session) | surface, media_type, tmdb_id | custom | **YES** |
| `share` | native share completed, or download produced | method, content_type, item_id | recommended | no |
| `search` | full-results search submitted (never per keystroke) | search_term (sanitized), surface | recommended | no |
| `login` / `sign_up` | auth call resolved without error | method | recommended | sign_up **YES** |
| `guide_clicked` | guide teaser clicked | surface, content_slug | custom | no |
| `explore_tab` | homepage explore tab | tab, surface | custom | no |

**Recommended key events (mark manually in GA4 Admin → Events):**
`provider_clicked`, `watchlist_added`, `ticket_created`, `sign_up`. Not
`recommendation_viewed` initially — it fires often and would inflate
conversion counts; promote it later only if you need an upper-funnel metric.

**Custom dimensions to register (Admin → Custom definitions), all
low-cardinality:** `surface`, `media_type`, `mood`, `quick_pick`,
`provider`, `recommendation_source`. Do NOT register `tmdb_id`,
`content_slug` or `search_term` — high-cardinality; they stay as event
params for DebugView/BigQuery.

**Funnel mapping (brief §11):** landing (`page_view`) → discovery
(`picker_started`/`mood_selected`/`quick_pick_selected`/`search`) →
`recommendation_viewed` → title interaction (`page_view` on detail /
`trailer_played`) → `provider_clicked` → `watchlist_added`/`ticket_created`/
`sign_up`.

## F. PII safeguards

Central sanitizer on every event: drops null/undefined; caps strings at 100
chars; **drops entirely** any value shaped like an email, phone number, JWT
(`eyJ…`), Bearer/api-key string, or 40+-char token — with a dev-only console
warning that names the parameter but never echoes the value. No user IDs, no
`user_id` feature, no user properties set at all in this pass (GA's automatic
device/geo properties suffice). Search terms are capped at 60 chars and pass
the same sanitizer. Nothing intrusive: no session replay, no fingerprinting,
no heatmaps.

## G. Performance

Zero new dependencies — bundle delta is ~3 KB of first-party module code
(measured: homepage first-load JS unchanged at 630 KB before/after within
rounding). The gtag script itself was already loading `afterInteractive`
(never blocks FCP/LCP). Provider links and navigation never wait on
analytics: events are fire-and-forget, gtag queues offline.

## H. Cloudflare / R2 impact — verified none

Every capture path is `"use client"` code calling `window.gtag` →
google-analytics.com directly. Grep-verified: no new API route, no server
action, no `revalidatePath`/`revalidateTag`, no R2/Supabase writes for
events, no route TTL touched, no cache-key surface changed, no OpenNext
config change. The only server-rendered bytes added are the inline consent
script (static, identical for every visitor — part of the same cached layout
HTML). Analytics contributes exactly zero R2 Class A.

## I. GA4 console steps (manual, ~10 minutes)

1. You already have the GA4 property (`NEXT_PUBLIC_GA_ID` = your `G-…` id) —
   nothing to create. Verify the Web Data Stream URL is
   `https://cinetonight.com` (Admin → Data streams).
2. Admin → Data streams → your stream → **Enhanced measurement → turn OFF
   "Page views" is not needed** (we disable via `send_page_view`), but DO
   turn off "Site search" enhanced measurement to avoid double search
   tracking; leave scrolls/outbound clicks as you prefer.
3. Admin → Events → after deploy, mark as key events: `provider_clicked`,
   `watchlist_added`, `ticket_created`, `sign_up`.
4. Admin → Custom definitions → add the six dimensions from §E (event scope).
5. Admin → Data settings → Data retention → set 14 months.

## J. Test results (local production build, gtag stubbed)

Captured event stream from a scripted session: `recommendation_viewed`
(seed, source=trending) → `quick_pick_selected` (quick_pick=short) →
`recommendation_failed` (no_results — correct: the sandbox has no TMDB
network, proving the failure path) → `another_pick` ×2 (attempt_number 1, 2)
→ `provider_clicked` (youtube_search) → `watchlist_added`. **Duplicates:
none. Page errors: none.** TypeScript clean, Next build clean, OpenNext
build clean. Consent-denied path: `track()` returns before gtag. Ad-blocker
path: `gtagRaw()` returns null, all events no-op, site unaffected.

## K. Production verification (right after deploy)

1. Open cinetonight.com with `?firebase` no — simply browse; in GA4 →
   Reports → Realtime: confirm your visit appears with the right page.
2. Add `#debug` style DebugView: install the GA Debugger extension OR append
   `?_dbg=1`-less — easiest: GA4 Admin → DebugView shows events from any
   browser with the "Google Analytics Debugger" extension enabled. Verify:
   `page_view` on a client-side navigation (homepage → Movies without a
   reload), `picker_started`, `mood_selected`, `search`, `provider_clicked`,
   `watchlist_added` — each once per action, params normalized, no PII.
3. Toggle the footer "Turn off" control → confirm no further events in
   DebugView; "Turn on" → events resume without refresh.
4. Confirm in Cloudflare that the R2 Class A trend is unchanged by this
   deploy beyond the normal one-time generation refill.

## Initial reporting setup (brief §31–32, build after events validate)

Start with standard reports: Acquisition (source/medium, landing pages),
Engagement (pages, engagement time). Then three Explorations: (1) Funnel:
page_view → any discovery event → recommendation_viewed → provider_clicked;
(2) Path: from homepage vs from a blog landing; (3) Free-form: mood and
quick_pick vs provider_clicked count — answers "which moods actually lead to
watch intent". Compare `another_pick` attempt_number distribution monthly —
rising attempts = recommendation quality falling.

## Privacy policy wording (for your review — not auto-published)

Add under an "Analytics" heading on the Privacy Policy page: *"CineTonight
uses Google Analytics to understand, in aggregate, how the site is used —
which pages people visit, which features they use (such as mood picks and
Where-to-Watch links), how long they stay, and where visitors come from. This
data is anonymous usage measurement; we do not send your email, name, or
account details to Google. Google processes this data as our service
provider. You can turn analytics off at any time using the control in the
site footer."* Flag for your own legal review; not legal advice.
