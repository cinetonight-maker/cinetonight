import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = { title: "Latest Releases" };
export default function Page() {
  return <ListingPage title="Latest Releases" sub="Fresh off the reel." kind="all" badges defaultSort="year" />;
}
