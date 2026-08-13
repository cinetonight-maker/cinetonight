"use client";

import { usePathname } from "next/navigation";

/** When the dashboard's Settings → "Maintenance mode" checkbox is on, every
 *  public page renders this instead — except /admin (and /admin/login), so
 *  the site owner can always get back in to switch it off again. Wraps the
 *  whole site chrome (header/sidebar/footer), not just the page content, so
 *  a visitor sees a clean standalone notice rather than a working nav bar
 *  around an empty page. */
export default function MaintenanceGate({ active, children }: { active: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith("/admin");

  if (active && !isAdmin) {
    return (
      <div className="maintenance">
        <div className="maintenance__c">
          <div className="brand__name">Cine<b>Tonight</b></div>
          <h1>We&apos;ll be right back</h1>
          <p>This site is down for scheduled maintenance. Please check back shortly.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
