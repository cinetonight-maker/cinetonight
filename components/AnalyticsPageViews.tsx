"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { trackPageView } from "@/lib/analytics";

/** THE single source of page_view events.
 *
 *  Automatic GA4 page measurement is disabled in app/layout.tsx
 *  (`send_page_view: false`), because in an App Router SPA the automatic
 *  page_view only fires on the initial document load — every client-side
 *  navigation after that was invisible. This component fires exactly one
 *  page_view per real URL change:
 *
 *  - initial load: fires once (the ref starts empty);
 *  - client navigation: pathname/searchParams change -> one fire;
 *  - React Strict Mode double-effects, re-renders, redirect chains landing
 *    on the same URL: suppressed by the last-URL ref;
 *  - query params: only `genre` is kept (a bounded set that changes the
 *    page's actual content). Search text (?q=), page numbers, UTM and junk
 *    params never enter page_path — GA still reads campaign params itself
 *    from the real URL, so acquisition reporting is unaffected.
 */
export default function AnalyticsPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const last = useRef<string | null>(null);

  const genre = searchParams.get("genre");
  const url = genre ? `${pathname}?genre=${encodeURIComponent(genre)}` : pathname;

  useEffect(() => {
    if (last.current === url) return;
    last.current = url;
    trackPageView(url);
  }, [url]);

  return null;
}
