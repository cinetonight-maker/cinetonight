/** Shared site-URL helper — same fallback chain used by sitemap.ts,
 *  robots.ts, and any JSON-LD structured data that needs an absolute URL.
 *  Set NEXT_PUBLIC_SITE_URL once there's a real custom domain; falls back
 *  to the Vercel-provided deployment URL, then localhost, so nothing here
 *  ever crashes for being unset — it just won't have the right domain
 *  until NEXT_PUBLIC_SITE_URL is set.
 *
 *  In a production runtime, silently falling back is dangerous: every
 *  canonical tag, OG url, and the sitemap itself route through this
 *  helper, so a missing env var would bake a Vercel preview/localhost
 *  domain into everything search engines see. We still don't crash (a
 *  wrong domain beats a broken build), but we log loudly, once, so the
 *  misconfiguration shows up in server logs instead of going unnoticed. */
let warnedMissingSiteUrl = false;

export function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production" && !warnedMissingSiteUrl) {
    warnedMissingSiteUrl = true;
    console.error(
      "[moviex] NEXT_PUBLIC_SITE_URL is not set in production. " +
        "Canonical tags, OpenGraph URLs, and the sitemap are falling back to " +
        (process.env.VERCEL_URL ? `the Vercel deployment URL (${process.env.VERCEL_URL})` : "http://localhost:3000") +
        " — set NEXT_PUBLIC_SITE_URL to your real domain to fix this."
    );
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Validate a `?next=` redirect target before handing it to router.push().
 *  Only same-origin relative paths are allowed. Next's router will happily
 *  hard-navigate to an absolute or protocol-relative URL, so passing a
 *  raw query param straight through is an open redirect: an attacker can
 *  send someone to /admin/login?next=https://evil.example/phish, and after
 *  a real successful login they land on the attacker's page. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback; // no absolute URLs ("https://...")
  if (next.startsWith("//")) return fallback; // no protocol-relative URLs ("//evil.example")
  if (/^\/\\/.test(next)) return fallback; // some browsers normalize "/\evil.com" to "//evil.com"
  return next;
}

/** Per-page metadata for the /movies, /tv-shows, /web-series, /trending and
 *  /latest listing pages, which all share the same `?genre=X` filter and
 *  previously reused one static title/description regardless of which
 *  genre (if any) was selected. sitemap.ts lists `/movies?genre=X` for
 *  every genre as its own indexable URL — without unique metadata per
 *  genre, those all looked like near-duplicate pages to a crawler. Doesn't
 *  import Next's `Metadata` type at the value level (type-only import is
 *  erased at compile time), so this stays safe to use from any component. */
export function listingMetadata(opts: {
  path: `/${string}`;
  baseTitle: string;
  baseDescription: string;
  genre?: string;
}): { title: string; description: string; alternates: { canonical: string } } {
  const { path, baseTitle, baseDescription, genre } = opts;
  if (!genre || genre === "All") {
    return { title: baseTitle, description: baseDescription, alternates: { canonical: path } };
  }
  return {
    title: `${genre} ${baseTitle}`,
    description: `${genre} picks: ${baseDescription}`,
    alternates: { canonical: `${path}?genre=${encodeURIComponent(genre)}` },
  };
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
