/* ============================================================================
 * lib/revalidatePlan.ts — decides EXACTLY what an admin action invalidates.
 *
 * Pure functions, no Next, no fetch, no database — so every rule below is
 * unit-tested in tests/revalidatePlan.test.mjs and can be read in one place
 * instead of being scattered through the API routes.
 *
 * THE RULES, and why each is what it is:
 *
 *  1. SURGICAL ONLY. A plan names specific tags, specific paths and specific
 *     URLs. There is no "purge everything" branch, and nothing here can
 *     produce one — the CDN purge takes a list of exact URLs, never a wildcard.
 *
 *  2. AUTOSAVE INVALIDATES NOTHING. Autosave writes a draft column the public
 *     site never reads, so there is nothing to invalidate. `planFor` returns
 *     an EMPTY plan for it, and a test asserts that emptiness directly.
 *
 *  3. THE HOMEPAGE IS CONDITIONAL. The homepage renders a Guides strip of the
 *     newest N posts. It is revalidated only when the changed post is inside
 *     that strip before or after the change — never "just in case".
 *
 *  4. TEASER SURFACES ARE LEFT ALONE ON PURPOSE. Movie pages, genre pages and
 *     listing pages also show a small Guides teaser, on the 6-hour tier. There
 *     are hundreds of those routes; revalidating them would be exactly the
 *     "large R2 regeneration" this must avoid, and a few hours of staleness on
 *     a three-item teaser is invisible. See lib/data.ts's getBlogs() comment.
 *
 *  5. PAGES NEED NO PATH. `/[slug]` is force-dynamic — it renders per request
 *     and has no route-cache entry at all. Its only staleness is the cached
 *     Supabase read, so invalidating the data tags is the complete fix.
 * ========================================================================= */

/** How many posts the homepage Guides strip shows (components/BlogSection). */
export const HOME_GUIDES = 3;

export type AdminAction =
  | {
      kind: "blog";
      slug: string;
      /** Was this post visible on the site BEFORE the change? */
      wasLive: boolean;
      /** Is it visible AFTER the change? */
      isLive: boolean;
      /** Was it inside the homepage Guides strip before or after? */
      touchesHomeGuides: boolean;
    }
  | { kind: "page"; slug: string }
  /** Publishing or rolling back the homepage configuration. */
  | { kind: "homepage" }
  /** Publishing or rolling back the discovery configuration. */
  | { kind: "discovery" }
  /** Publishing site settings. */
  | { kind: "settings" }
  /** Creating, editing, enabling, disabling or deleting a redirect rule.
   *  `sources` are the from_paths whose behaviour changed. */
  | { kind: "redirect"; sources: string[] }
  /** Autosave, draft discard — anything the public site cannot see. */
  | { kind: "none" };

export interface RevalidationPlan {
  /** Cache tags to invalidate (data cache + our own content tags). */
  tags: string[];
  /** Route paths to revalidate (full route / ISR cache). */
  paths: string[];
  /** Absolute URLs to purge from the CDN edge cache, one by one. */
  urls: string[];
}

export const EMPTY_PLAN: RevalidationPlan = { tags: [], paths: [], urls: [] };

/** Tags this project ever revalidates. Used both here and as the tag-cache
 *  filter in open-next.config.ts, so the tag store is only ever consulted for
 *  routes we actually invalidate — every other route keeps today's behaviour
 *  and pays nothing. */
export const CMS_TAG_PATTERN = /^(cms:|_N_T_\/$|_N_T_\/blog(\/|$))/;

/** Accepts either a plain tag or OpenNext's `{ tag, stale, expire }` write
 *  shape, because the same predicate is used for reads and for writes. */
export const isCmsTag = (tag: string | { tag: string }): boolean =>
  CMS_TAG_PATTERN.test(typeof tag === "string" ? tag : tag.tag);

/** Only these paths are ever edge-cached with an s-maxage (see next.config.ts
 *  headers). Purging anything else would be a wasted API call. */
const CDN_CACHED = (path: string) => path === "/" || path === "/blog" || path.startsWith("/blog/");

export function planFor(action: AdminAction, origin: string): RevalidationPlan {
  if (action.kind === "none") return EMPTY_PLAN;

  if (action.kind === "homepage") {
    // Exactly one route. The homepage config governs nothing else, so nothing
    // else is invalidated — this is the whole blast radius.
    return {
      tags: ["cms:homepage"],
      paths: ["/"],
      urls: [`${origin.replace(/\/$/, "")}/`],
    };
  }

  if (action.kind === "settings") {
    // The site title and description live in the ROOT LAYOUT, so they appear
    // on every page. Revalidating every route would be the bulk regeneration
    // the architecture forbids — hundreds of R2 writes for a text change. The
    // data tag is cleared so each page picks the new value up on its own next
    // rebuild, and the dashboard says so rather than implying it is instant.
    return { tags: ["cms:settings"], paths: [], urls: [] };
  }

  if (action.kind === "redirect") {
    // Three things have to be cleared for a rule change to take effect, and
    // ONLY for the addresses that changed — never a bulk rebuild.
    //
    // 1. The data tag, so the rule set is re-read.
    // 2. The old address's own ISR entry. Measured: a redirect response is
    //    persisted per path exactly like a 404, so without this the previous
    //    answer keeps being served from R2.
    // 3. The CDN copy. Next owns the Cache-Control on a redirect response and
    //    emits `s-maxage=3600, stale-while-revalidate=...`, which we cannot
    //    override from a page. Purging the exact URL is what makes switching a
    //    rule off take effect at the edge instead of waiting out that window.
    //
    // No page is rebuilt: these addresses do not resolve to pages.
    const base = origin.replace(/\/$/, "");
    const paths = action.sources.filter((p) => p.startsWith("/")).slice(0, 30);
    return {
      tags: ["cms:redirects"],
      paths,
      urls: paths.map((p) => `${base}${p}`),
    };
  }

  if (action.kind === "discovery") {
    // The two surfaces that render moods, quick picks and Explore tabs.
    // Movie, genre and browse routes do not, so they are not touched.
    return {
      tags: ["cms:discovery"],
      paths: ["/", "/discover"],
      urls: [`${origin.replace(/\/$/, "")}/`],
    };
  }

  if (action.kind === "page") {
    // No paths: /[slug] is force-dynamic, so there is no route cache entry.
    return {
      tags: ["cms:pages", `cms:page:${action.slug}`],
      paths: [],
      urls: [],
    };
  }

  // Blog. Nothing on the public site changes if the post was invisible before
  // AND is still invisible now (e.g. editing a draft, trashing a draft).
  if (!action.wasLive && !action.isLive) return EMPTY_PLAN;

  const paths = [`/blog/${action.slug}`, "/blog"];
  if (action.touchesHomeGuides) paths.push("/");

  return {
    tags: ["cms:blog", `cms:blog:${action.slug}`],
    paths,
    urls: paths.filter(CDN_CACHED).map((p) => `${origin.replace(/\/$/, "")}${p === "/" ? "/" : p}`),
  };
}

export const isEmptyPlan = (p: RevalidationPlan): boolean =>
  p.tags.length === 0 && p.paths.length === 0 && p.urls.length === 0;

/** Would this post appear in the homepage Guides strip?
 *
 *  `liveSlugsNewestFirst` is the live post list in the same order the site
 *  renders it. Called once before the write and once after, so a post that
 *  drops OUT of the strip still triggers a homepage revalidation. */
export function inHomeGuides(liveSlugsNewestFirst: string[], slug: string): boolean {
  return liveSlugsNewestFirst.slice(0, HOME_GUIDES).includes(slug);
}
