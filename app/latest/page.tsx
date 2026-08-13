import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  return listingMetadata({
    path: "/latest",
    baseTitle: "Latest Movies & New OTT Releases",
    baseDescription: "Fresh off the reel — the newest movie and web series releases, updated as they drop.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage title="Latest Releases" sub="Fresh off the reel." kind="all" badges defaultSort="year" genre={genre} />;
}
