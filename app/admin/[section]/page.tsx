import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AdminDashboard from "@/components/AdminDashboard";
import BlogManager from "@/components/admin/BlogManager";
import LinksManager from "@/components/admin/LinksManager";
import RedirectsManager from "@/components/admin/RedirectsManager";
import PagesManager from "@/components/admin/PagesManager";
import ActivityLog from "@/components/admin/ActivityLog";
import HomepageManager from "@/components/admin/HomepageManager";
import DiscoveryManager from "@/components/admin/DiscoveryManager";
import HealthScreen from "@/components/admin/HealthScreen";
import MediaManager from "@/components/admin/MediaManager";
import SettingsManager from "@/components/admin/SettingsManager";
import { adminItemBySlug } from "@/lib/adminNav";

/** Screens rebuilt by the CMS update. Anything not listed here still renders
 *  through AdminDashboard until its own stage lands. */
const REBUILT: Record<string, () => React.ReactElement> = {
  blog: () => <BlogManager />,
  links: () => <LinksManager />,
  redirects: () => <RedirectsManager />,
  pages: () => <PagesManager />,
  activity: () => <ActivityLog />,
  homepage: () => <HomepageManager />,
  discovery: () => <DiscoveryManager />,
  health: () => <HealthScreen />,
  media: () => <MediaManager />,
  settings: () => <SettingsManager />,
};

export const dynamic = "force-dynamic";

interface Params { params: Promise<{ section: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { section } = await params;
  return { title: adminItemBySlug(section)?.label ?? "Admin" };
}

/** Stage 1: every admin section is its own ROUTE. The screen itself is still
 *  rendered by the existing AdminDashboard (which owns all the working CRUD)
 *  with its internal tab strip hidden — later stages replace these one module
 *  at a time without ever changing the URL a user has bookmarked. */
export default async function AdminSectionPage({ params }: Params) {
  const { section } = await params;
  const item = adminItemBySlug(section);
  if (!item || item.planned) notFound();
  const rebuilt = REBUILT[section];
  if (rebuilt) return rebuilt();
  if (!item.section) notFound();
  return <AdminDashboard section={item.section} />;
}
