import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PlayerModal from "@/components/PlayerModal";
import MaintenanceGate from "@/components/MaintenanceGate";
import { AuthProvider } from "@/lib/auth";
import { getSiteSettings } from "@/lib/data";
import { baseUrl } from "@/lib/site";
import "./globals.css";

// Was a render-blocking request to fonts.googleapis.com on every page load
// (a full extra round trip before text could even paint, straight against
// LCP). The actual .woff2 files (from the official @fontsource/inter and
// @fontsource/poppins packages, same source as Google Fonts) now live in
// ./fonts and are bundled with the app via next/font/local — self-hosted
// from the same origin as everything else, zero layout shift, and zero
// runtime or build-time network dependency on Google at all. Exposed as
// CSS variables (not applied directly) so globals.css's existing
// font-family rules — which reference 'Poppins'/'Inter' by name all over
// the file — only needed a one-line find/replace to `var(--font-poppins)`
// / `var(--font-inter)` instead of a full rewrite.
const inter = localFont({
  src: [
    { path: "./fonts/inter-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/inter-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/poppins-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/poppins-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

// Was a static object pointing at hardcoded "MOVIEX" copy — Dashboard →
// SEO & Settings could be edited and saved all day with zero effect on the
// live site. Now sourced from the same settings row the dashboard writes.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  const shortName = s.siteTitle.split(" — ")[0] || s.siteTitle;
  return {
    // Without this, Next resolves every relative OG/Twitter image URL
    // (including the new opengraph-image.tsx/icon.tsx) against
    // "http://localhost:3000" in production — social platforms would fetch
    // a dead localhost link instead of the real image. baseUrl() already
    // knows the Vercel deployment URL / custom domain once one is set.
    metadataBase: new URL(baseUrl()),
    title: { default: s.siteTitle, template: `%s — ${shortName}` },
    description: s.siteDescription,
    keywords: s.metaKeywords || undefined,
    openGraph: { title: s.siteTitle, description: s.siteDescription, type: "website" },
    // Lets browsers/RSS readers auto-discover the blog feed, and gives free
    // RSS-to-social tools (Dlvr.it, IFTTT, Zapier) a standard URL to watch
    // for new posts without any manual setup on your end each time.
    alternates: { types: { "application/rss+xml": "/rss.xml" } },
  };
}
export const viewport: Viewport = { themeColor: "#0a0a12" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <AuthProvider>
          <MaintenanceGate active={settings.maintenanceMode}>
            <Header />
            <div className="app">
              <Sidebar />
              <div className="content">{children}</div>
            </div>
            <Footer />
            <BottomNav />
            <PlayerModal />
          </MaintenanceGate>
        </AuthProvider>
        {/* Free, zero-config traffic analytics. This only actually starts
            recording once the site is deployed on Vercel AND "Analytics" is
            turned on for the project in the Vercel dashboard (Project →
            Analytics → Enable) — that one-click toggle can't be done from
            code, but the tracking snippet is now wired up and ready the
            moment you flip it. */}
        <Analytics />
        {/* Real-user Core Web Vitals (LCP, CLS, INP) per page, broken down
            by route — same zero-config pattern as Analytics above. Also
            only starts recording once "Speed Insights" is switched on for
            the project in the Vercel dashboard (Project → Speed Insights →
            Enable); the collection snippet is wired up and ready now. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
