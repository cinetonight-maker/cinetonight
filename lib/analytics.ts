/** Thin wrapper over the GA4 tag already loaded in app/layout.tsx.
 *
 *  Deliberately tiny and defensive: analytics must never be able to break a
 *  user interaction. If the tag is blocked, missing (NEXT_PUBLIC_GA_ID unset,
 *  e.g. in development) or still loading, this is a no-op.
 *
 *  PRIVACY: pass only anonymous, non-identifying values - a mood id, a title,
 *  a section name. Never an email, user id, session token or anything typed
 *  into a form. */

type Params = Record<string, string | number | boolean>;

export function track(event: string, params: Params = {}) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag !== "function") return;
  try {
    gtag("event", event, params);
  } catch {
    /* analytics must never throw into the UI */
  }
}
