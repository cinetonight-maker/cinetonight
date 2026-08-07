import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import PlayerModal from "@/components/PlayerModal";
import MaintenanceGate from "@/components/MaintenanceGate";
import { getSiteSettings } from "@/lib/data";
import "./globals.css";

// Was a static object pointing at hardcoded "MOVIEX" copy — Dashboard →
// SEO & Settings could be edited and saved all day with zero effect on the
// live site. Now sourced from the same settings row the dashboard writes.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  const shortName = s.siteTitle.split(" — ")[0] || s.siteTitle;
  return {
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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
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
        {/* Free, zero-config traffic analytics. This only actually starts
            recording once the site is deployed on Vercel AND "Analytics" is
            turned on for the project in the Vercel dashboard (Project →
            Analytics → Enable) — that one-click toggle can't be done from
            code, but the tracking snippet is now wired up and ready the
            moment you flip it. */}
        <Analytics />
      </body>
    </html>
  );
}
