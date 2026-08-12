import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  return listingMetadata({
    path: "/tv-shows",
    baseTitle: "TV Shows",
    baseDescription: "Stream live TV and on-demand series — top-rated shows across every genre, updated daily.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage title="TV Shows" sub="Live TV and on-demand series." kind="series" defaultSort="year" genre={genre} />;
}
