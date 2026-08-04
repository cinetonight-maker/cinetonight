import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = { title: "Movies" };
export default function Page() {
  return <ListingPage title="Movies" sub="Blockbusters, classics and everything in between." kind="movie" defaultSort="year" />;
}
