/** Shared site-URL helper — same fallback chain used by sitemap.ts,
 *  robots.ts, and any JSON-LD structured data that needs an absolute URL.
 *  Set NEXT_PUBLIC_SITE_URL once there's a real custom domain; falls back
 *  to the Vercel-provided deployment URL, then localhost, so nothing here
 *  ever crashes for being unset — it just won't have the right domain
 *  until NEXT_PUBLIC_SITE_URL is set. */
export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** "2h 23m" / "45m" / "1h" → ISO 8601 duration ("PT2H23M"), for JSON-LD's
 *  Movie.duration. Schema.org wants this exact format; a plain "2h 23m"
 *  string there is silently ignored by Google's rich-results parser.
 *  Returns undefined for anything it can't confidently parse, rather than
 *  emitting a malformed duration. */
export function toIsoDuration(runtime: string | undefined | null): string | undefined {
  if (!runtime) return undefined;
  const h = runtime.match(/(\d+)\s*h/i)?.[1];
  const m = runtime.match(/(\d+)\s*m/i)?.[1];
  if (!h && !m) return undefined;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
}
