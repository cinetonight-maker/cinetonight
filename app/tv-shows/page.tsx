import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = { title: "TV Shows" };
export default function Page() {
  return <ListingPage title="TV Shows" sub="Live TV and on-demand series." kind="series" defaultSort="year" />;
}
