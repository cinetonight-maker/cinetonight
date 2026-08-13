import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  return listingMetadata({
    path: "/trending",
    baseTitle: "Trending Movies & Shows Today",
    baseDescription: "What everyone is watching this week — the most popular movies and shows right now.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage title="Trending" sub="What everyone is watching this week." kind="all" genre={genre} />;
}
