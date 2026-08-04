import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = { title: "Trending" };
export default function Page() {
  return <ListingPage title="Trending" sub="What everyone is watching this week." kind="all" />;
}
