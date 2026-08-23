import type { Metadata } from "next";
import ActivityDetail from "@/components/admin/ActivityDetail";

/** One audit entry, on its own deep-linkable URL — so an entry can be shared
 *  or bookmarked while investigating something. Read-only. */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Activity entry", robots: { index: false, follow: false } };

export default async function ActivityEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ActivityDetail id={id} />;
}
