/* ============================================================================
 * lib/settingsConfig.ts — the site settings, as validated data.
 *
 * Pure functions: no database, no Next. The rules below are what stop a typo
 * in the dashboard from putting a broken title on every page of the site.
 *
 * NOT HERE, deliberately:
 *  - The newsletter heading. That belongs to the Homepage manager, which owns
 *    that block. Two screens editing one string is how a dashboard becomes
 *    untrustworthy.
 *  - Footer links. Those are the Navigation screen, which already manages them.
 *  - The logo mark itself. It is a vector component (components/BrandMark),
 *    not an image URL — swapping it is a brand decision that belongs in code
 *    review, not a text field. The site TITLE next to it is editable here.
 * ========================================================================= */

export interface SiteSettingsConfig {
  siteTitle: string;
  siteDescription: string;
  metaKeywords: string;
  contactEmail: string;
  social: Record<string, string>;
  maintenanceMode: boolean;
}

/** The social networks CineTonight actually links to. A closed list: an
 *  arbitrary key here would render an icon-less link in the footer. */
export const SOCIAL_KEYS = ["facebook", "instagram", "youtube", "tiktok", "telegram", "twitter"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  facebook: "Facebook", instagram: "Instagram", youtube: "YouTube",
  tiktok: "TikTok", telegram: "Telegram", twitter: "X / Twitter",
};

export const DEFAULTS: SiteSettingsConfig = {
  siteTitle: "CineTonight - What to Watch Tonight: Trailers & OTT Picks",
  siteDescription: "Know what to watch tonight - trailers, ratings, OTT release updates and where to legally stream movies, web series, K-Drama & anime.",
  metaKeywords: "",
  contactEmail: "officialcinetonight@gmail.com",
  social: {},
  maintenanceMode: false,
};

const MAX_TITLE = 70;
const MAX_DESC = 170;
const MAX_KEYWORDS = 300;
const MAX_URL = 200;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A social link must be a real http(s) URL. Anything else is dropped rather
 *  than rendered — a `javascript:` href in the footer would be an XSS hole. */
const safeUrl = (v: unknown): string => {
  const s = str(v, MAX_URL);
  return /^https?:\/\/\S+$/i.test(s) ? s : "";
};

export function normalizeSettings(raw: unknown): SiteSettingsConfig {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteSettingsConfig>;
  const social: Record<string, string> = {};
  for (const k of SOCIAL_KEYS) {
    const url = safeUrl((src.social as Record<string, unknown> | undefined)?.[k]);
    if (url) social[k] = url;
  }
  return {
    siteTitle: str(src.siteTitle, MAX_TITLE) || DEFAULTS.siteTitle,
    siteDescription: str(src.siteDescription, MAX_DESC) || DEFAULTS.siteDescription,
    metaKeywords: str(src.metaKeywords, MAX_KEYWORDS),
    contactEmail: str(src.contactEmail, 120),
    social,
    maintenanceMode: src.maintenanceMode === true,
  };
}

/** What would look wrong to a visitor or to Google. */
export function validateSettings(s: SiteSettingsConfig): string[] {
  const out: string[] = [];
  if (s.siteTitle.length < 10) out.push("The site title is very short - Google shows it on every page.");
  if (s.siteDescription.length < 50) out.push("The site description is very short. Aim for 120–160 characters.");
  if (s.contactEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.contactEmail)) out.push("That contact email does not look like an email address.");
  return out;
}

export function describeSettings(s: SiteSettingsConfig): string {
  const links = Object.keys(s.social).length;
  return `${s.siteTitle.slice(0, 40)}${s.siteTitle.length > 40 ? "…" : ""} · ${links} social link${links === 1 ? "" : "s"}${s.maintenanceMode ? " · MAINTENANCE MODE ON" : ""}`;
}

export const settingsDirty = (live: unknown, draft: unknown): boolean =>
  JSON.stringify(normalizeSettings(live)) !== JSON.stringify(normalizeSettings(draft));

/** Database row → config. The column names differ from the field names. */
export const fromRow = (row: Record<string, unknown> | null | undefined): SiteSettingsConfig =>
  normalizeSettings({
    siteTitle: row?.site_title, siteDescription: row?.site_description,
    metaKeywords: row?.meta_keywords, contactEmail: row?.contact_email,
    social: row?.social, maintenanceMode: row?.maintenance_mode,
  });

/** Config → the live columns the public site reads. */
export const toRow = (s: SiteSettingsConfig) => ({
  site_title: s.siteTitle, site_description: s.siteDescription,
  meta_keywords: s.metaKeywords, contact_email: s.contactEmail,
  social: s.social, maintenance_mode: s.maintenanceMode,
});
