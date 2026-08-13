import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
import { listingMetadata } from "@/lib/site";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ genre?: string }> }): Promise<Metadata> {
  const { genre } = await searchParams;
  return listingMetadata({
    path: "/web-series",
    baseTitle: "Web Series — Trailers & Where to Stream",
    baseDescription: "Binge-worthy original web series and trending shows — the latest seasons, ranked and filterable by genre.",
    genre,
  });
}

export default async function Page({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams;
  return <ListingPage title="Web Series" sub="Binge-worthy originals and trending shows." kind="series" badges defaultSort="year" genre={genre} />;
}
