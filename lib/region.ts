import "server-only";
import { headers } from "next/headers";

/** The site serves ALL of Asia and beyond — India, Pakistan, Bangladesh,
 *  Sri Lanka, Nepal, and worldwide. Every region-sensitive surface
 *  (Where to Watch, channel pages, channel cards) resolves the VISITOR's
 *  country and shows that country's availability, so nobody is sent to a
 *  geo-blocked platform.
 *
 *  Resolution order:
 *  1. x-vercel-ip-country — set per-request in production, so each
 *     visitor automatically gets their own country.
 *  2. NEXT_PUBLIC_DEFAULT_REGION — for local dev (no geo header); set it
 *     to your own country (e.g. PK) to preview that market.
 *  3. "IN" — the single largest market, as the last-resort default. */
export async function visitorRegion(): Promise<string> {
  const h = await headers();
  const raw = h.get("x-vercel-ip-country") ?? process.env.NEXT_PUBLIC_DEFAULT_REGION ?? "IN";
  return /^[A-Z]{2}$/i.test(raw) ? raw.toUpperCase() : "IN";
}

/** "PK" → "Pakistan", "BD" → "Bangladesh", ... */
export function regionName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
