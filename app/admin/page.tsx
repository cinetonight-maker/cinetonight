import type { Metadata } from "next";
import Overview from "@/components/admin/Overview";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return <Overview />;
}
