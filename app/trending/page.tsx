import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = {
  title: "Trending",
  description: "What everyone is watching this week — the most popular movies and shows right now.",
};
export default function Page() {
  return <ListingPage title="Trending" sub="What everyone is watching this week." kind="all" />;
}
