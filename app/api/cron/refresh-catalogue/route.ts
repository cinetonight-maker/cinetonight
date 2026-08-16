import { NextResponse } from "next/server";
import { syncCatalogue } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily catalogue auto-sync. Thin authenticated wrapper around the shared
 *  sync engine in lib/sync.ts - the dashboard's Sync Now button runs the
 *  exact same engine, so scheduled and manual syncs can never drift apart.
 *  Called by the external scheduler (cron-job.org) with
 *  `Authorization: Bearer <CRON_SECRET>`. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed - no secret set, no runs allowed
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await syncCatalogue("cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
