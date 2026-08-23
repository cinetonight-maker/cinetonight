"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackGuideClicked, type Surface } from "@/lib/analytics";

/** Client wrapper for editorial-guide links rendered by server components
 *  (BlogSection). Fires guide_clicked on the actual click only; navigation
 *  is never blocked or delayed by the event. */
export default function GuideLink({
  href, slug, surface, className, children,
}: { href: string; slug: string; surface: Surface; className?: string; children: ReactNode }) {
  return (
    <Link className={className} href={href} onClick={() => trackGuideClicked({ surface, content_slug: slug })}>
      {children}
    </Link>
  );
}
