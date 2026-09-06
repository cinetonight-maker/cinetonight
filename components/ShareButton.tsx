"use client";

import { useState } from "react";
import Icon from "./Icon";
import { trackShare } from "@/lib/analytics";

/** Hero "Share" action for the V2 movie/series page.
 *
 *  Shares the page's own canonical URL (passed in as a prop from
 *  app/movie/[id]/page.tsx - the same `${baseUrl()}/movie/${m.id}` formula
 *  used for the canonical <link> and JSON-LD, not window.location, which
 *  could carry a stray query string or a pre-redirect path).
 *
 *  Web Share API (mobile browsers, some desktop browsers) when available;
 *  otherwise falls back to copying the link, matching the pattern already
 *  used in components/AdminDashboard.tsx (`navigator.clipboard?.writeText`).
 *  Deliberately separate from TicketStub's share (which shares a generated
 *  ticket IMAGE, not this page) - different action, different content_type
 *  in analytics. */
export default function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url });
        trackShare({ method: "native_share", content_type: "movie_page", item_id: url });
      } catch {
        // User cancelled the native share sheet, or the platform rejected it
        // (e.g. no share target chosen) - no-op, nothing to fall back to.
      }
      return;
    }
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      trackShare({ method: "copy_link", content_type: "movie_page", item_id: url });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or blocked (older browser, permissions,
      // non-secure context) - fails silently, same as the admin copy button.
    }
  }

  return (
    <button
      type="button"
      className="btn btn--ghost"
      onClick={share}
      aria-label={copied ? "Link copied" : `Share ${title}`}
    >
      <Icon name="share" size={16} /> <span>{copied ? "Link Copied" : "Share"}</span>
    </button>
  );
}
