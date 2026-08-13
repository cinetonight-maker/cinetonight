import { ImageResponse } from "next/og";

/** Dynamic favicon — the project had NO favicon/app-icon at all before this
 *  (confirmed nothing in public/), so every browser tab, bookmark, and
 *  mobile "Add to Home Screen" prompt was showing a blank/generic page icon.
 *  Generated at build time from JSX (same ImageResponse/Satori mechanism as
 *  opengraph-image.tsx) so it needs no external image asset and stays on
 *  brand automatically. Next.js serves this at /icon and wires up the
 *  <link rel="icon"> tag itself — no manual <head> edit needed. */
export const size = { width: 32, height: 32 };
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
          borderRadius: 6,
        }}
      >
        <span style={{ display: "flex", fontSize: 20, fontWeight: 800, color: "#a855f7" }}>C</span>
      </div>
    ),
    { ...size }
  );
}
