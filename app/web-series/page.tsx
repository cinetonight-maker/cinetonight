import type { Metadata } from "next";
import ListingPage from "@/components/ListingPage";
export const metadata: Metadata = {
  title: "Web Series",
  description: "Binge-worthy original web series and trending shows — the latest seasons, ranked and filterable by genre.",
};
export default function Page() {
  return <ListingPage title="Web Series" sub="Binge-worthy originals and trending shows." kind="series" badges defaultSort="year" />;
}
