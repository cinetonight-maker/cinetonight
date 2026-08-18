import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PlayerModal from "@/components/PlayerModal";
import MaintenanceGate from "@/components/MaintenanceGate";
import { AuthProvider } from "@/lib/auth";
import { getSiteSettings } from "@/lib/data";
import { baseUrl, shortBrandName } from "@/lib/site";
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

// Was a static object pointing at hardcoded "CineTonight" copy — Dashboard →
// SEO & Settings could be edited and saved all day with zero effect on the
// live site. Now sourced from the same settings row the dashboard writes.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  // Brand-name extraction for the "%s — Brand" title template. Handles a
  // separator of any punctuation (dash, pipe, bullet, colon); if the title
  // has NO separator at all, a long derived name falls back to its first
  // word so page titles never carry the whole tagline as a suffix.
  const shortName = shortBrandName(s.siteTitle);
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
    // suppressHydrationWarning on <html> AND <body>: browser extensions
    // (ColorZilla, Grammarly, password managers, extension launchers...)
    // inject attributes like cz-shortcut-listen / crxlauncher into both
    // elements before React hydrates, which triggers a scary-but-harmless
    // hydration warning in dev. This silences attribute mismatches on these
    // two elements ONLY — children still get full hydration checking, so
    // real bugs elsewhere are still caught.
    <html lang="en" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Almost every image on the site comes from TMDB's CDN — opening
            the connection early shaves the TLS handshake off the first
            poster paint. (preconnect links are honored in <body>.) */}
        <link rel="preconnect" href="https://image.tmdb.org" crossOrigin="anonymous" />
        {/* WebSite structured data + SearchAction: tells Google this site
            has its own search, making it eligible for a search box directly
            in the SERP (sitelinks searchbox). */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static JSON-LD, not user input
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              // Google's "site name" in results (the label above the URL) reads
              // this — must be the BRAND, never the full tagline title.
              name: shortBrandName(settings.siteTitle),
              alternateName: "cinetonight.com",
              url: baseUrl(),
              potentialAction: {
                "@type": "SearchAction",
                target: { "@type": "EntryPoint", urlTemplate: `${baseUrl()}/search?q={search_term_string}` },
                "query-input": "required name=search_term_string",
              },
            }).replace(/</g, "\\u003c"),
          }}
        />
        {/* Organization entity: declares WHO runs this site (name, logo,
            social profiles) — the sameAs links strengthen the brand's
            entity graph, which is what AI search engines (Perplexity,
            Gemini, ChatGPT Search) use to recognize and cite a source. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- static JSON-LD, not user input
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: shortBrandName(settings.siteTitle),
              url: baseUrl(),
              logo: `${baseUrl()}/logo-512.png`,
              ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
              ...(Object.values(settings.social).filter(Boolean).length
                ? { sameAs: Object.values(settings.social).filter(Boolean) }
                : {}),
            }).replace(/</g, "\\u003c"),
          }}
        />
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
        {/* Vercel <Analytics /> and <SpeedInsights /> were removed when the
            site moved to Cloudflare Workers: their scripts only exist on
            Vercel's platform, so here every single pageview fired two
            requests to /_vercel/... that 404'd THROUGH THE WORKER - two
            billable Worker invocations per visit for nothing, plus console
            errors on every page. GA4 below is the analytics stack. */}
        {/* Google Analytics 4 — activates only when NEXT_PUBLIC_GA_ID is
            set (e.g. G-XXXXXXXXXX). GA4 complements Vercel Analytics with
            audience insight (countries, devices, acquisition channels,
            content performance over time) and is what ad/affiliate
            partners expect to see. Scripts load afterInteractive so they
            never block rendering. */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
