import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = {
  title: "Movies",
  description: "Browse blockbusters, classics and everything in between — Hollywood and Bollywood movies in HD, filterable by genre.",
};
export default function Page() {
  return <ListingPage title="Movies" sub="Blockbusters, classics and everything in between." kind="movie" defaultSort="year" />;
}
