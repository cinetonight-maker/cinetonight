import { ImageResponse } from "next/og";

/** Dynamic favicon — the project had NO favicon/app-icon at all before this
 *  (confirmed nothing in public/), so every browser tab, bookmark, and
 *  mobile "Add to Home Screen" prompt was showing a blank/generic page icon.
 *  Generated at build time from JSX (same ImageResponse/Satori mechanism as
 *  opengraph-image.tsx) so it needs no external image asset and stays on
 *  brand automatically. Next.js serves this at /icon and wires up the
 *  <link rel="icon"> tag itself — no manual <head> edit needed. */
// 96px (a multiple of 48) — Google Search ignores favicons under 48px,
// which kept the OLD logo cached in results after the rebrand.
export const size = { width: 96, height: 96 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a12",
          borderRadius: 18,
        }}
      >
        <svg width="84" height="84" viewBox="0 0 100 100">
          <path d="M40 34 L40 66 L68 50 Z" fill="#a855f7" stroke="#a855f7" strokeWidth="16" strokeLinejoin="round" />
          <path d="M36 8 Q38.6 21.4 52 24 Q38.6 26.6 36 40 Q33.4 26.6 20 24 Q33.4 21.4 36 8 Z" fill="#f4f2fa" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
