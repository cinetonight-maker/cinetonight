import type { Metadata } from "next";

// robots.txt already disallows /admin, but Google's own docs are explicit
// that a disallow rule only stops crawling — a URL that gets discovered via
// an external link can still be indexed (with no snippet) even though it
// was never crawled. An actual noindex meta tag is the only thing that
// guarantees the dashboard never shows up in search results. Metadata
// merges down the tree, so every page under /admin (including the login
// page, which sets no metadata of its own) inherits this automatically.
export const metadata: Metadata = {
  robots: { index: false, follow: false, noimageindex: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
