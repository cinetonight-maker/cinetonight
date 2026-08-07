"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "moviex:lastSeenIds";

/** Cheap "welcome back" nudge — no account, no schema change, just a
 *  browser-side diff against what was on the homepage last time this
 *  visitor was here. First-ever visit silently seeds localStorage and shows
 *  nothing (there's nothing to compare against yet); every visit after that
 *  can surface "N new titles since you were last here" if the homepage's
 *  current top slice differs from what was recorded. */
export default function NewSinceLastVisit({ ids, titles }: { ids: string[]; titles: Record<string, string> }) {
  const [freshTitles, setFreshTitles] = useState<string[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const prevRaw = localStorage.getItem(KEY);
      if (prevRaw) {
        const prevSet = new Set<string>(JSON.parse(prevRaw));
        const fresh = ids.filter((id) => !prevSet.has(id));
        if (fresh.length) setFreshTitles(fresh.map((id) => titles[id]).filter(Boolean));
      }
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      // localStorage can throw in private-browsing/quota-exceeded edge
      // cases — worst case the banner just never shows, nothing breaks.
    }
    // Only ever run this diff once per page load, against the ids this
    // page was rendered with — re-running on every re-render would compare
    // against what we just wrote and always find zero new titles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!freshTitles?.length || dismissed) return null;
  const [first, ...rest] = freshTitles;

  return (
    <div className="wb">
      <span>
        <b>{freshTitles.length} new title{freshTitles.length > 1 ? "s" : ""}</b> since your last visit
        {first ? <> — including <Link href="/latest">{first}{rest.length ? ` +${rest.length} more` : ""}</Link></> : null}
      </span>
      <button className="wb__x" onClick={() => setDismissed(true)} aria-label="Dismiss">×</button>
    </div>
  );
}
