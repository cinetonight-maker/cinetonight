import { ImageResponse } from "next/og";

/** Site-wide default share-preview image — used by any route that doesn't
 *  define its own (movie and blog pages already have one via
 *  generateMetadata; this is what shows up when someone shares the
 *  homepage, /movies, /trending, /person/[id], etc. on WhatsApp, Telegram,
 *  Instagram DMs, X, or Facebook). Before this, those links shared as a
 *  bare title with no image at all — a real gap given the whole growth
 *  plan runs on people sharing links from social. Generated at request
 *  time from JSX/CSS (Next's built-in ImageResponse/Satori), so it needs
 *  no external image asset and stays in sync with the brand colors in
 *  globals.css automatically if this file is updated alongside them. */
export const alt = "CineTonight — Know What to Watch Tonight";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0a12 0%, #1b1b27 100%)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(circle at 30% 20%, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0) 45%)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", fontSize: 110, fontWeight: 800, letterSpacing: -3, color: "#eceaf2" }}>
          Cine
          <span style={{ color: "#a855f7" }}>Tonight</span>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "#8b8798", marginTop: 22, fontWeight: 500 }}>
          Know what to watch — tonight.
        </div>
      </div>
    ),
    { ...size }
  );
}
