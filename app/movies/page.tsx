import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  return listingMetadata({
    path: "/movies",
    baseTitle: "Movies",
    baseDescription: "Browse blockbusters, classics and everything in between — Hollywood and Bollywood movies in HD, filterable by genre.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage title="Movies" sub="Blockbusters, classics and everything in between." kind="movie" defaultSort="year" genre={genre} />;
}
