"use client";

import { useEffect, useState } from "react";
import { getAnalyticsConsent, setAnalyticsConsent, type ConsentChoice } from "@/lib/analytics";

/** Minimal, honest analytics opt-out — lives in the footer.
 *
 *  Not a banner and not a dark pattern: one line, one toggle, equal weight
 *  to both choices. Combined with the regional Consent Mode defaults set in
 *  app/layout.tsx (denied by default in EEA/UK/CH, granted elsewhere), this
 *  is the smallest compliant foundation for an analytics-only site: users
 *  anywhere can switch analytics off (or on) and the change applies
 *  immediately, without a refresh. */
export default function PrivacyChoices() {
  const [choice, setChoice] = useState<ConsentChoice>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); setChoice(getAnalyticsConsent()); }, []);
  if (!mounted) return null; // consent state is client-only; render nothing on SSR

  const effectiveOn = choice !== "denied";
  const toggle = () => {
    const next = !effectiveOn;
    setAnalyticsConsent(next);
    setChoice(next ? "granted" : "denied");
  };

  return (
    <p className="privchoice">
      Anonymous usage analytics: <b>{effectiveOn ? "on" : "off"}</b>{" "}
      <button type="button" className="privchoice__btn" onClick={toggle}>
        {effectiveOn ? "Turn off" : "Turn on"}
      </button>
    </p>
  );
}
