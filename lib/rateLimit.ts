import "server-only";

/**
 * Best-effort per-client throttle for public API routes. An in-memory map
 * only limits a single warm serverless instance, not a whole fleet, but
 * it's a real deterrent for casual bots/scripts and costs nothing extra to
 * run. For a multi-instance production deployment under sustained abuse,
 * swap the store for something shared (Upstash Redis, Vercel KV, or a
 * Postgres-backed check) keyed the same way — the `clientKey()` logic below
 * stays valid either way.
 *
 * Each call site gets its own bucket (pass a distinct `scope`) so a burst
 * on one endpoint (e.g. /api/search) doesn't eat another endpoint's quota
 * (e.g. /api/comments).
 */
const buckets = new Map<string, number[]>();

export function isRateLimited(key: string, scope: string, opts: { windowMs: number; max: number }): boolean {
  const bucketKey = `${scope}:${key}`;
  const now = Date.now();
  const recent = (buckets.get(bucketKey) ?? []).filter((t) => now - t < opts.windowMs);
  recent.push(now);
  buckets.set(bucketKey, recent);

  // Bound memory: the map only grows with distinct keys seen in the
  // current process lifetime, so periodically drop fully-expired entries.
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t >= opts.windowMs)) buckets.delete(k);
    }
  }

  return recent.length > opts.max;
}

/**
 * Best-effort client identifier for rate limiting. On Vercel, `x-forwarded-
 * for` is overwritten by their edge network and external values are NOT
 * forwarded — see https://vercel.com/docs/headers/request-headers — so a
 * caller can't reset their own quota by sending a fake header when this
 * runs on Vercel. `x-vercel-forwarded-for` is preferred when present since
 * it stays accurate even if a proxy sits in front of Vercel (e.g.
 * Cloudflare). We still can't guarantee accuracy in every possible hosting
 * setup (self-hosted behind an unknown proxy chain, `next dev`, etc.), so
 * this remains a deterrent against casual/scripted abuse, not a hard
 * guarantee — genuinely resistant abuse protection needs the shared-store
 * upgrade mentioned above plus a WAF/edge rate limiter in front of it.
 */
export function clientKey(request: Request): string {
  const vercelFwd = request.headers.get("x-vercel-forwarded-for");
  if (vercelFwd) return vercelFwd.split(",")[0].trim();

  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // Take the LAST entry, not the first: XFF chains read "client, proxy1,
    // proxy2, ...", and only the entry appended by the hop directly in
    // front of this server is guaranteed accurate — earlier entries can be
    // whatever the original client claimed. On Vercel there's normally
    // only one entry (see above), so this is defense-in-depth for other
    // hosting setups rather than something Vercel itself needs.
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return request.headers.get("x-real-ip") || "unknown";
}
