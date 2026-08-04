import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import PlayerModal from "@/components/PlayerModal";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MOVIEX — Watch More, Stream Better", template: "%s — MOVIEX" },
  description: "MOVIEX — stream the latest movies and web series in HD. Trending titles, top rated picks, and your personal watchlist.",
  openGraph: { title: "MOVIEX — Watch More, Stream Better", description: "Stream the latest movies and web series in HD.", type: "website" },
};
export const viewport: Viewport = { themeColor: "#0a0a12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Header />
        <div className="app">
          <Sidebar />
          <div className="content">{children}</div>
        </div>
        <Footer />
        <PlayerModal />
      </body>
    </html>
  );
}
