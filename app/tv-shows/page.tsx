import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  // STAB-07 (settled 1 Sep 2026): /tv-shows and /web-series serve the same
  // series inventory, and /web-series is the page that actually ranks
  // (founder's Search Console evidence). Both URLs stay live — nothing is
  // deleted or redirected — but this page CANONICALIZES to /web-series so
  // exactly one series hub owns the ranking. /tv-shows is also out of the
  // sitemap for the same reason.
  return listingMetadata({
    path: "/web-series",
    baseTitle: "TV Shows — What to Watch on OTT",
    baseDescription: "Stream live TV and on-demand series — top-rated shows across every genre, updated daily.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage path="/tv-shows" title="TV Shows" sub="Live TV and on-demand series." kind="series" defaultSort="year" genre={genre} />;
}
