"use client";

/**
 * CineTonight analytics foundation — one module, client-only, GA4 via the
 * gtag tag loaded in app/layout.tsx.
 *
 * WHY THERE IS NO FIREBASE SDK HERE (deliberate, per the analytics brief's
 * own first rule): the site already ships a working GA4 property through
 * gtag. Firebase Analytics for web is the SAME GA4 measurement underneath —
 * adding firebase/app + firebase/analytics would double-initialize the same
 * data stream, risk duplicate page_views, and add ~35 KB of JavaScript for
 * zero additional data. Everything the brief requires (client-only capture,
 * consent mode, typed events, sanitization, taxonomies) is implemented on
 * the existing tag. If a Firebase-only product is ever genuinely needed,
 * this event dictionary transfers unchanged.
 *
 * HARD RULES enforced here:
 * - Browser → Google only. No CineTonight API relay, no R2, no Supabase
 *   writes, no server-side calls. Nothing in this file can run during SSR.
 * - Analytics can never break the UI: every path is try/caught and no-ops
 *   when the tag is blocked, unset (no NEXT_PUBLIC_GA_ID), or denied.
 * - No PII: a sanitizer drops null/undefined, caps lengths, and redacts
 *   anything that looks like an email, phone number, or token. In
 *   development it warns (without echoing the unsafe value).
 * - Controlled vocabularies for surface / media type / provider /
 *   recommendation source, so GA4 reports aggregate instead of fragmenting.
 */

/* ------------------------------ taxonomies ------------------------------ */

export type Surface =
  | "homepage" | "movie_detail" | "series_detail" | "search" | "trending"
  | "latest" | "top_rated" | "genre" | "mood" | "quick_pick" | "blog"
  | "my_list" | "free_movies" | "unknown";

export type AnalyticsMediaType = "movie" | "series" | "unknown";

/** Site vocabulary ("movie" | "series" | historical route names) → the ONE
 *  analytics vocabulary. Never send "tv", "tv_show" or "web_series". */
export const toMediaType = (kind?: string | null): AnalyticsMediaType =>
  kind === "movie" ? "movie" : kind === "series" ? "series" : "unknown";

export type RecommendationSource =
  | "random_picker" | "mood" | "quick_pick" | "related" | "trending"
  | "search" | "editorial";

/** channel slug / free-form name → normalized analytics provider value.
 *  One value per real-world service; search-link fallbacks get their own
 *  explicit values instead of polluting the provider list. */
const PROVIDER_MAP: Record<string, string> = {
  "netflix": "netflix",
  "prime-video": "prime_video",
  "jiohotstar": "jiohotstar",
  "apple-tv": "apple_tv_plus",
  "zee5": "zee5",
  "sony-liv": "sony_liv",
  "crunchyroll": "crunchyroll",
  "viki": "viki",
  "sun-nxt": "sun_nxt",
  "hoichoi": "hoichoi",
  "shemaroo-me": "shemaroo_me",
  "lionsgate-play": "lionsgate_play",
  "youtube": "youtube",
  "mx-player": "mx_player",
  "aha": "aha",
};
export const toProvider = (slugOrName: string): string =>
  PROVIDER_MAP[slugOrName] ?? slugOrName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

/** "date-night" → "date_night" etc. — normalized snake_case ids. */
export const toSnake = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/* ------------------------------- consent -------------------------------- */

const CONSENT_KEY = "cinetonight:analytics-consent";
export type ConsentChoice = "granted" | "denied" | null;

/** The user's explicit stored choice, if any. `null` = never asked/answered,
 *  in which case Google Consent Mode's regional defaults (set inline in
 *  app/layout.tsx BEFORE the tag loads) govern: denied in EEA/UK/CH,
 *  granted elsewhere. Advertising consent is ALWAYS denied — CineTonight
 *  runs analytics, not ads. */
export function getAnalyticsConsent(): ConsentChoice {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch { return null; }
}

/** Grant or withdraw analytics consent. Takes effect immediately, no page
 *  refresh: consent-mode update + Google's documented kill switch
 *  (window["ga-disable-<ID>"]). Withdrawal stops all FUTURE collection;
 *  previously collected data lives in Google Analytics under its own
 *  retention settings — this function cannot and does not claim to delete
 *  it (users can clear the _ga cookies via their browser). */
export function setAnalyticsConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
    const id = process.env.NEXT_PUBLIC_GA_ID;
    if (id) (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = !granted;
    gtagRaw()?.("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
      // Advertising stays denied regardless of the analytics choice.
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
    });
  } catch { /* consent handling must never throw */ }
}

/* ------------------------------ sanitizer ------------------------------- */

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /(?:\+?\d[\s\-().]?){7,}/;
const TOKEN_RE = /(eyJ[\w-]{10,}|Bearer\s|api[_-]?key|access[_-]?token|[A-Za-z0-9+/=_-]{40,})/i;

/** Drop null/undefined, cap strings, and redact anything email/phone/token
 *  shaped. Dev builds warn (naming the KEY only, never the value). */
function sanitize(params: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "number" || typeof v === "boolean") { out[k] = v; continue; }
    let s = String(v).trim();
    if (!s) continue;
    if (EMAIL_RE.test(s) || PHONE_RE.test(s) || TOKEN_RE.test(s)) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[analytics] dropped unsafe-looking value for param "${k}"`);
      }
      continue;
    }
    if (s.length > 100) s = s.slice(0, 100);
    out[k] = s;
  }
  return out;
}

/* ------------------------------ core send ------------------------------- */

type Gtag = (...args: unknown[]) => void;
const gtagRaw = (): Gtag | null => {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: Gtag }).gtag;
  return typeof g === "function" ? g : null;
};

/** One-shot guard for events that must not repeat in a mounted lifetime
 *  (Strict Mode double-effects, re-renders, reopened modals). */
const firedOnce = new Set<string>();
export function once(key: string): boolean {
  if (firedOnce.has(key)) return false;
  firedOnce.add(key);
  return true;
}

export function track(event: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (getAnalyticsConsent() === "denied") return; // explicit opt-out: hard stop
  const g = gtagRaw();
  if (!g) return;
  try { g("event", event, sanitize(params)); } catch { /* never throws into UI */ }
}

/* --------------------------- page-view strategy -------------------------- */

/** Manual page_view for App Router client navigations. Automatic
 *  measurement is disabled in layout.tsx ("send_page_view: false"), so this
 *  is the ONLY page_view source — no double-fire on load, redirects, or
 *  Strict Mode (the caller guards with a last-URL ref). Query params are
 *  NOT forwarded except "genre" (bounded), so search text and junk params
 *  never reach Analytics. */
export function trackPageView(path: string, title?: string) {
  track("page_view", {
    page_path: path,
    page_location: typeof window !== "undefined" ? window.location.origin + path : path,
    page_title: title ?? (typeof document !== "undefined" ? document.title : undefined),
  });
}

/* --------------------------- typed product events ------------------------ */
/* GA4 RECOMMENDED events are used where one exists (search, share, login,
 * sign_up); custom events cover CineTonight-specific behaviour only. Fire
 * at SUCCESS boundaries, never at attempt time. */

export const trackPickerStarted = (p: { surface: Surface; media_type?: AnalyticsMediaType }) =>
  track("picker_started", p);

export const trackMoodSelected = (p: { mood: string; surface: Surface; media_type?: AnalyticsMediaType }) =>
  track("mood_selected", { ...p, mood: toSnake(p.mood) });

export const trackQuickPickSelected = (p: { quick_pick: string; surface: Surface }) =>
  track("quick_pick_selected", { ...p, quick_pick: toSnake(p.quick_pick) });

export const trackRecommendationViewed = (p: {
  surface: Surface; recommendation_source: RecommendationSource;
  media_type?: AnalyticsMediaType; mood?: string; quick_pick?: string; tmdb_id?: number | string;
}) => track("recommendation_viewed", { ...p, mood: p.mood && toSnake(p.mood), quick_pick: p.quick_pick && toSnake(p.quick_pick) });

export const trackRecommendationFailed = (p: { failure_type: "no_results" | "network"; surface: Surface }) =>
  track("recommendation_failed", p);

export const trackAnotherPick = (p: { surface: Surface; attempt_number: number; recommendation_source: RecommendationSource }) =>
  track("another_pick", p);

export const trackProviderClicked = (p: {
  provider: string; surface: Surface; media_type: AnalyticsMediaType; tmdb_id?: number | string;
}) => track("provider_clicked", { ...p, provider: toProvider(p.provider) });

export const trackTrailerPlayed = (p: { surface: Surface; media_type: AnalyticsMediaType; tmdb_id?: number | string }) =>
  track("trailer_played", p);

export const trackWatchlistAdded = (p: { surface: Surface; media_type: AnalyticsMediaType; tmdb_id?: number | string }) =>
  track("watchlist_added", p);

export const trackWatchlistRemoved = (p: { surface: Surface; media_type: AnalyticsMediaType; tmdb_id?: number | string }) =>
  track("watchlist_removed", p);

export const trackTicketCreated = (p: { surface: Surface; media_type: AnalyticsMediaType; tmdb_id?: number | string }) =>
  track("ticket_created", p);

/** GA4 recommended "share" — used for the ticket download/share action. */
export const trackShare = (p: { method: string; content_type: string; item_id?: string }) =>
  track("share", p);

/** GA4 recommended "search". The term is sanitized (trim/cap) and the
 *  sanitizer drops email/phone/token-shaped input entirely; when the term is
 *  dropped the event still fires as behavioural signal without text. */
export const trackSearch = (term: string, p: { surface: Surface } = { surface: "search" }) =>
  track("search", { search_term: term.trim().slice(0, 60), ...p });

export const trackLogin = () => track("login", { method: "password" });
export const trackSignUp = () => track("sign_up", { method: "password" });

export const trackGuideClicked = (p: { surface: Surface; content_slug?: string }) =>
  track("guide_clicked", p);
