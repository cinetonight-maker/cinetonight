import { permanentRedirect } from "next/navigation";

/** Legacy prefix: custom pages moved from /p/<slug> to /<slug> (cleaner,
 *  keyword-bearing URLs). 308 keeps old links, bookmarks and anything
 *  already indexed working — and tells crawlers to transfer the URL's
 *  standing to the new address. */
export default async function LegacyCustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
