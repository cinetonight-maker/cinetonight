/* ============================================================================
 * lib/discoveryConfig.ts — what the discovery experience OFFERS, as data.
 *
 * Stage 6. Pure functions and constants: no database, no Next, no fetch — so
 * every rule is unit-tested and the same module serves the public pages, the
 * admin screen and the preview.
 *
 * THE LINE THIS MODULE DRAWS, AND WHY IT IS WHERE IT IS
 *
 * Editable:  label, emoji/icon, order, on/off, and Tonight's Pick RULES.
 * Locked:    every id, and every genre / rating / runtime rule behind it.
 *
 * Two hard reasons, neither of them stylistic:
 *
 *  1. THE ID IS THE CACHE KEY. `/api/mood` and `/api/explore` validate their
 *     inputs against these closed lists; that is what keeps the cache-key
 *     space provably bounded (1,620 mood combinations). A dashboard field that
 *     could mint a new id would reopen an unbounded key space — the same
 *     mistake as the old `/person/*` route, which cost real money.
 *
 *  2. THE RULES ARE WHAT MAKE THE SITE HONEST. A recommendation's "why it
 *     fits" line is generated from a mood's actual genre rules and a quick
 *     pick's actual constraints. Let someone rename "Dark" to "Family Night"
 *     while the rules still select crime thrillers, and the site starts lying
 *     to readers. Labels move; rules do not.
 *
 * DISABLING IS PRESENTATION ONLY. A mood that is switched off disappears from
 * the homepage but still validates at the API, so an old bookmark or a shared
 * link keeps working — and the cache-key space is IDENTICAL whether an entry
 * is on or off. Turning things off can never change cardinality.
 * ========================================================================= */

/** The locked identity sets. These mirror lib/moods.ts, lib/quickPicks.ts and
 *  components/home/ExploreTabs.tsx, which remain the source of the RULES. */
export const MOOD_IDS = [
  "happy", "romantic", "relaxed", "stressed",
  "excited", "need-a-laugh", "dark", "thoughtful",
] as const;

export const QUICK_PICK_IDS = [
  "date-night", "short", "feelgood", "family", "hidden-gem", "highly-rated",
] as const;

export const EXPLORE_TAB_IDS = [
  "for-you", "hollywood", "bollywood", "south", "korean", "international",
] as const;

/** Streaming services shown on the homepage row. Slugs mirror lib/channels.ts,
 *  which stays the source of the TMDB provider id, the logo and the colour —
 *  this config only decides which appear and in what order. A slug is part of
 *  the /channel/<slug> URL, so it is not editable for the same reason mood ids
 *  are not. */
export const PROVIDER_IDS = [
  "netflix", "prime-video", "jiohotstar", "apple-tv", "zee5", "sony-liv",
  "crunchyroll", "viki", "sun-nxt", "hoichoi", "shemaroo-me",
  "lionsgate-play", "youtube", "mx-player", "aha",
] as const;

export type MoodId = (typeof MOOD_IDS)[number];
export type QuickPickId = (typeof QUICK_PICK_IDS)[number];
export type ExploreTabId = (typeof EXPLORE_TAB_IDS)[number];
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface EntryConfig {
  on: boolean;
  /** Shown to visitors. Empty falls back to the built-in label. */
  label?: string;
  /** Moods use an emoji; quick picks use an Icon name. */
  icon?: string;
  /** Quick picks only: the one-line rule description under the label. */
  sub?: string;
}

export interface TonightRules {
  /** Bias the recommendation toward one mood, or leave it open. */
  preferMood: MoodId | "any";
  /** Floor on the TMDB score, 0 = no floor. */
  minRating: number;
  /** Films, series, or either. */
  kind: "any" | "movie" | "series";
}

export interface DiscoveryConfig {
  moods: { order: MoodId[]; entries: Record<MoodId, EntryConfig> };
  quickPicks: { order: QuickPickId[]; entries: Record<QuickPickId, EntryConfig> };
  explore: { order: ExploreTabId[]; entries: Record<ExploreTabId, EntryConfig>; defaultTab: ExploreTabId };
  /** The streaming-service shortcuts row. */
  providers: { order: ProviderId[]; entries: Record<ProviderId, EntryConfig> };
  tonight: TonightRules;
}

/** Built-in labels, used as the fallback whenever a config leaves one blank.
 *  Kept here (not imported) so this module stays pure and dependency-free. */
export const BUILTIN = {
  moods: {
    happy: { label: "Happy", icon: "😊" },
    romantic: { label: "Romantic", icon: "💕" },
    relaxed: { label: "Relaxed", icon: "🧘" },
    stressed: { label: "Stressed", icon: "😮‍💨" },
    excited: { label: "Excited", icon: "⚡" },
    "need-a-laugh": { label: "Need a Laugh", icon: "😂" },
    dark: { label: "Dark", icon: "🌑" },
    thoughtful: { label: "Thoughtful", icon: "🧠" },
  } as Record<MoodId, { label: string; icon: string }>,
  quickPicks: {
    "date-night": { label: "Date Night", sub: "Romantic, well reviewed", icon: "thumbup" },
    short: { label: "Under 90 Minutes", sub: "Home before bedtime", icon: "cal" },
    feelgood: { label: "Feel Good", sub: "Nothing heavy", icon: "sparkle" },
    family: { label: "Family Night", sub: "Nothing dark or violent", icon: "user" },
    "hidden-gem": { label: "Hidden Gem", sub: "Well rated, less talked about", icon: "star" },
    "highly-rated": { label: "Highly Rated", sub: "Score of 8 and up", icon: "crown" },
  } as Record<QuickPickId, { label: string; sub: string; icon: string }>,
  providers: Object.fromEntries([
    ["netflix", "Netflix"], ["prime-video", "Prime Video"], ["jiohotstar", "JioHotstar"],
    ["apple-tv", "Apple TV+"], ["zee5", "ZEE5"], ["sony-liv", "Sony LIV"],
    ["crunchyroll", "Crunchyroll"], ["viki", "Rakuten Viki"], ["sun-nxt", "Sun NXT"],
    ["hoichoi", "Hoichoi"], ["shemaroo-me", "ShemarooMe"], ["lionsgate-play", "Lionsgate Play"],
    ["youtube", "YouTube"], ["mx-player", "MX Player"], ["aha", "Aha"],
  ].map(([id, label]) => [id, { label }])) as Record<ProviderId, { label: string }>,
  explore: {
    "for-you": { label: "Tonight Mix" },
    hollywood: { label: "Hollywood" },
    bollywood: { label: "Bollywood" },
    south: { label: "South Indian" },
    korean: { label: "Korean" },
    international: { label: "International" },
  } as Record<ExploreTabId, { label: string }>,
};

/** What each locked rule actually does, so the dashboard can SHOW the rule it
 *  will not let you edit. A control that hides its own constraints is worse
 *  than one that has none. */
export const RULE_SUMMARY = {
  moods: {
    happy: "Comedy, Family, Music, Adventure, Animation - never Horror, Crime, War or Thriller",
    romantic: "Romance - never Horror, War or Crime",
    relaxed: "Gentle, low-tension genres",
    stressed: "Calming picks, tension excluded",
    excited: "Action, Adventure, Thriller",
    "need-a-laugh": "Comedy first",
    dark: "Crime, Thriller, Horror, Mystery",
    thoughtful: "Drama, History, Documentary",
  } as Record<MoodId, string>,
  quickPicks: {
    "date-night": "Romantic mood, rating 7+",
    short: "Under 90 minutes",
    feelgood: "Happy mood, nothing heavy",
    family: "Family mood, nothing dark or violent",
    "hidden-gem": "Rating 7+, low vote count",
    "highly-rated": "Rating 8+",
  } as Record<QuickPickId, string>,
};

const MAX_LABEL = 40;
const MAX_SUB = 80;
const MAX_ICON = 8;

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

function normalizeGroup<Id extends string>(
  ids: readonly Id[],
  raw: { order?: unknown; entries?: unknown } | undefined,
  fallback: Record<Id, { label: string; sub?: string; icon?: string }>,
  opts: { hasSub: boolean; hasIcon: boolean },
) {
  const requested = Array.isArray(raw?.order)
    ? (raw!.order as unknown[]).filter((x): x is Id => ids.includes(x as Id))
    : [];
  const order = [...new Set(requested)];
  for (const id of ids) if (!order.includes(id)) order.push(id);

  const entries = {} as Record<Id, EntryConfig>;
  const src = (raw?.entries && typeof raw.entries === "object" ? raw.entries : {}) as Record<string, EntryConfig>;
  for (const id of ids) {
    const e = (src[id] ?? {}) as EntryConfig;
    const out: EntryConfig = { on: typeof e.on === "boolean" ? e.on : true };
    out.label = clean(e.label, MAX_LABEL) ?? fallback[id].label;
    if (opts.hasSub) out.sub = clean(e.sub, MAX_SUB) ?? fallback[id].sub;
    if (opts.hasIcon) out.icon = clean(e.icon, MAX_ICON) ?? fallback[id].icon;
    entries[id] = out;
  }
  return { order, entries };
}

/** Force any stored value into a valid, renderable config.
 *
 *  This is the guard that makes the feature safe. Unknown ids are dropped —
 *  which is exactly what stops a hand-edited row from widening the cache-key
 *  space — missing ids are appended, labels are bounded, and a blank label
 *  falls back to the built-in one rather than rendering an empty chip. */
export function normalizeConfig(raw: unknown): DiscoveryConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<DiscoveryConfig>;

  const moods = normalizeGroup(MOOD_IDS, src.moods as never, BUILTIN.moods, { hasSub: false, hasIcon: true });
  const quickPicks = normalizeGroup(QUICK_PICK_IDS, src.quickPicks as never, BUILTIN.quickPicks, { hasSub: true, hasIcon: true });
  const explore = normalizeGroup(EXPLORE_TAB_IDS, src.explore as never, BUILTIN.explore, { hasSub: false, hasIcon: false });
  const providers = normalizeGroup(PROVIDER_IDS, src.providers as never, BUILTIN.providers, { hasSub: false, hasIcon: false });

  // The default tab must be a tab that is actually ON, or the page opens on
  // something the visitor cannot see.
  const wanted = (src.explore as { defaultTab?: unknown } | undefined)?.defaultTab;
  const enabledTabs = explore.order.filter((id) => explore.entries[id].on);
  const defaultTab: ExploreTabId =
    typeof wanted === "string" && enabledTabs.includes(wanted as ExploreTabId)
      ? (wanted as ExploreTabId)
      : (enabledTabs[0] ?? EXPLORE_TAB_IDS[0]);

  const t = (src.tonight ?? {}) as Partial<TonightRules>;
  const rating = Number(t.minRating);
  const tonight: TonightRules = {
    preferMood: MOOD_IDS.includes(t.preferMood as MoodId) ? (t.preferMood as MoodId) : "any",
    minRating: Number.isFinite(rating) ? Math.min(9, Math.max(0, Math.round(rating * 10) / 10)) : 0,
    kind: t.kind === "movie" || t.kind === "series" ? t.kind : "any",
  };

  return { moods, quickPicks, explore: { ...explore, defaultTab }, providers, tonight };
}

/** The shipped experience, used whenever the config table is missing, empty or
 *  unreadable — so a configuration fault can never empty the homepage. */
export const DEFAULT_CONFIG: DiscoveryConfig = normalizeConfig({});

/* ------------------------------- reading -------------------------------- */

export const enabledMoods = (c: DiscoveryConfig): MoodId[] => c.moods.order.filter((id) => c.moods.entries[id].on);
export const enabledQuickPicks = (c: DiscoveryConfig): QuickPickId[] => c.quickPicks.order.filter((id) => c.quickPicks.entries[id].on);
export const enabledExploreTabs = (c: DiscoveryConfig): ExploreTabId[] => c.explore.order.filter((id) => c.explore.entries[id].on);
export const enabledProviders = (c: DiscoveryConfig): ProviderId[] => c.providers.order.filter((id) => c.providers.entries[id].on);

/** Would publishing this leave a usable discovery experience?
 *
 *  Not taste — these are the states that would leave the decision engine with
 *  nothing to offer, which is the entire purpose of the homepage. */
export function validateConfig(c: DiscoveryConfig): string[] {
  const problems: string[] = [];
  if (enabledMoods(c).length === 0) problems.push("Every mood is switched off. The mood picker would be empty.");
  if (enabledQuickPicks(c).length === 0) problems.push("Every Quick Pick is switched off. The one-tap starting points would be empty.");
  if (enabledExploreTabs(c).length === 0) problems.push("Every Explore tab is switched off. The Explore block would be empty.");
  if (!enabledExploreTabs(c).includes(c.explore.defaultTab)) {
    problems.push("The Explore tab that opens by default is switched off.");
  }
  if (enabledProviders(c).length === 0) problems.push("Every streaming service is switched off. That row would be empty.");
  return problems;
}

export function describeConfig(c: DiscoveryConfig): string {
  const t = c.tonight;
  const rule =
    t.preferMood === "any" && t.minRating === 0 && t.kind === "any"
      ? "Tonight's Pick open to everything"
      : [
          t.preferMood === "any" ? null : `prefers ${BUILTIN.moods[t.preferMood].label}`,
          t.minRating > 0 ? `rating ${t.minRating}+` : null,
          t.kind === "any" ? null : t.kind === "movie" ? "films only" : "series only",
        ].filter(Boolean).join(", ");
  return `${enabledMoods(c).length}/${MOOD_IDS.length} moods, ${enabledQuickPicks(c).length}/${QUICK_PICK_IDS.length} quick picks, ${enabledExploreTabs(c).length}/${EXPLORE_TAB_IDS.length} tabs · ${rule}`;
}

export const isDirty = (live: unknown, draft: unknown): boolean =>
  JSON.stringify(normalizeConfig(live)) !== JSON.stringify(normalizeConfig(draft));

/** Every id this config can ever produce — the proof that switching things off
 *  cannot change the cache-key space. Used by a test. */
export const allIds = (c: DiscoveryConfig): string[] =>
  [...c.moods.order, ...c.quickPicks.order, ...c.explore.order, ...c.providers.order].sort();
