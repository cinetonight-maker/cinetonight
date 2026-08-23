/* ============================================================================
 * lib/homepageConfig.ts — what the homepage shows, as data.
 *
 * Stage 5. Pure functions and constants: no database, no Next, no fetch — so
 * every rule here is unit-tested, and the same module is used by the public
 * page, the admin screen and the preview.
 *
 * THE ONE RULE THAT OVERRIDES EVERYTHING ELSE
 *
 * The homepage is a decision engine, not a catalogue (see app/page.tsx). Its
 * spine — the hero question, then Quick Picks / moods / the single
 * recommendation — is LOCKED by the Phase 3 design and cannot be switched off
 * or reordered from the dashboard. Everything below that is support, and that
 * is what this config governs.
 *
 * Making the spine editable would let one wrong click turn the homepage back
 * into the shelf-stack it deliberately stopped being, so it is not offered.
 * ========================================================================= */

export type SectionId = "trending" | "streaming" | "explore" | "guides" | "myList" | "newsletter";

export interface SectionConfig {
  on: boolean;
  /** Heading shown on the site. Empty falls back to the default. */
  title?: string;
  sub?: string;
  /** How many items the section shows, where it has a count. */
  count?: number;
}

export interface HomepageConfig {
  hero: {
    /** The page's H1. This is the site's single most SEO-significant line, so
     *  it is editable but always falls back to the shipped wording rather than
     *  ever rendering empty. */
    title?: string;
    /** The paragraph under it. */
    sub?: string;
    /** Catalogue ids whose artwork the hero uses. Empty = automatic (the
     *  trending list picks it), which is the default and usually the right
     *  answer — a manual pick goes stale, an automatic one never does. */
    picks: string[];
  };
  /** Order of the movable sections, top to bottom. */
  order: SectionId[];
  sections: Record<SectionId, SectionConfig>;
}

/** What each section is, in the words the dashboard uses, plus its limits. */
export const SECTION_META: Record<SectionId, {
  label: string;
  what: string;
  /** Sections with no count control leave this undefined. */
  count?: { min: number; max: number; default: number; unit: string };
  hasText: boolean;
}> = {
  trending:   { label: "Trending Tonight", what: "The most popular titles on TMDB right now", count: { min: 4, max: 12, default: 6, unit: "titles" }, hasText: true },
  streaming:  { label: "Streaming Services", what: "The row of provider shortcuts", hasText: false },
  explore:    { label: "Explore Tonight", what: "The industry tabs (Bollywood, Korean, Hollywood…)", hasText: false },
  guides:     { label: "What to Watch Guides", what: "Your newest blog posts", count: { min: 2, max: 6, default: 3, unit: "guides" }, hasText: true },
  myList:     { label: "My List preview", what: "A reminder of what the visitor saved", hasText: false },
  newsletter: { label: "Newsletter signup", what: "The email capture block at the bottom", hasText: true },
};

export const ALL_SECTIONS: SectionId[] = ["trending", "streaming", "explore", "guides", "myList", "newsletter"];

/** The homepage exactly as it ships today. This is the fallback whenever the
 *  config table is missing, empty or unreadable, so the site can never end up
 *  blank because of a configuration problem. */
export const DEFAULT_CONFIG: HomepageConfig = {
  hero: {
    title: "What should you watch tonight?",
    sub: "Tell us the mood, how long you have and where you subscribe. We will find something worth watching and show you exactly where it is streaming.",
    picks: [],
  },
  order: [...ALL_SECTIONS],
  sections: {
    trending:   { on: true, title: "Trending Tonight", sub: "The most popular titles on TMDB right now", count: 6 },
    streaming:  { on: true },
    explore:    { on: true },
    guides:     { on: true, title: "What to Watch Guides", sub: "Written guides to help you decide", count: 3 },
    myList:     { on: true },
    newsletter: { on: true, title: "Never run out of something to watch", sub: "One email a week: what just landed on your streaming services, what is worth your evening, and the OTT release dates we are tracking." },
  },
};

const MAX_HERO_PICKS = 8;
const MAX_TEXT = 120;
const MAX_SUB = 260;

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};

/** Force any stored value into a valid config.
 *
 *  This is the guard that makes the whole feature safe: whatever is in the
 *  database — an old shape, a hand-edited row, a half-written draft — comes
 *  out of here as something the homepage can render. Unknown sections are
 *  dropped, missing ones are appended in their default position, and counts
 *  are clamped to their allowed range. */
export function normalizeConfig(raw: unknown): HomepageConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<HomepageConfig>;

  const picks = Array.isArray(src.hero?.picks)
    ? [...new Set(src.hero!.picks.filter((p): p is string => typeof p === "string" && !!p.trim()))].slice(0, MAX_HERO_PICKS)
    : [];

  const requested = Array.isArray(src.order) ? src.order.filter((s): s is SectionId => ALL_SECTIONS.includes(s as SectionId)) : [];
  const order = [...new Set(requested)];
  for (const s of ALL_SECTIONS) if (!order.includes(s)) order.push(s);

  const sections = {} as Record<SectionId, SectionConfig>;
  for (const id of ALL_SECTIONS) {
    const d = DEFAULT_CONFIG.sections[id];
    const s = (src.sections?.[id] ?? {}) as SectionConfig;
    const meta = SECTION_META[id];

    const out: SectionConfig = { on: typeof s.on === "boolean" ? s.on : d.on };
    if (meta.hasText) {
      out.title = clean(s.title, MAX_TEXT) ?? d.title;
      out.sub = clean(s.sub, MAX_SUB) ?? d.sub;
    }
    if (meta.count) {
      const n = Number(s.count);
      out.count = Number.isFinite(n)
        ? Math.min(meta.count.max, Math.max(meta.count.min, Math.round(n)))
        : (d.count ?? meta.count.default);
    }
    sections[id] = out;
  }

  return {
    hero: {
      title: clean(src.hero?.title, MAX_TEXT) ?? DEFAULT_CONFIG.hero.title,
      sub: clean(src.hero?.sub, MAX_SUB) ?? DEFAULT_CONFIG.hero.sub,
      picks,
    },
    order,
    sections,
  };
}

/** The sections to render, in order, with the off ones removed. */
export function visibleSections(config: HomepageConfig): SectionId[] {
  return config.order.filter((id) => config.sections[id]?.on);
}

/** Would publishing this leave a usable homepage?
 *
 *  Not a style opinion — these are the two states that would make the page
 *  read as broken to a visitor. Everything else is the editor's call. */
export function validateConfig(config: HomepageConfig): string[] {
  const problems: string[] = [];
  const visible = visibleSections(config);
  if (visible.length === 0) {
    problems.push("Every section is switched off. The homepage would be just the hero and the picker.");
  }
  for (const id of ALL_SECTIONS) {
    const meta = SECTION_META[id];
    const s = config.sections[id];
    if (!s?.on || !meta.hasText) continue;
    if (!s.title?.trim()) problems.push(`${meta.label} is on but has no heading.`);
  }
  return problems;
}

/** A one-line summary for the admin list and the audit note. */
export function describeConfig(config: HomepageConfig): string {
  const on = visibleSections(config).length;
  const hero = config.hero.picks.length ? `${config.hero.picks.length} hero pick${config.hero.picks.length === 1 ? "" : "s"}` : "automatic hero";
  return `${hero}, ${on} of ${ALL_SECTIONS.length} sections on`;
}

/** Is the draft different from what is live? Compared on the NORMALISED
 *  shapes, so a cosmetic difference in the stored JSON never shows as an
 *  unpublished change. */
export function isDirty(live: unknown, draft: unknown): boolean {
  return JSON.stringify(normalizeConfig(live)) !== JSON.stringify(normalizeConfig(draft));
}
