import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canonicalGenre } from "@/lib/genres";
import { guardPath } from "@/lib/pathGuard";

/** The five browse hubs that accept `?genre=`. A closed, hard-coded list —
 *  see the genre block inside middleware() for why this check lives here. */
const GENRE_HUBS: ReadonlySet<string> = new Set([
  "/movies", "/tv-shows", "/web-series", "/trending", "/latest",
]);

/**
 * Two jobs, on two different scopes:
 *
 * 1. Refresh the Supabase session cookie on every real page/API request
 *    (see `config.matcher` below — everything except static assets). This
 *    now matters for every signed-in visitor, not just admins: public
 *    /signin + /signup (see app/signin, app/signup) create ordinary
 *    Supabase Auth sessions too. Skipping this outside /admin used to mean
 *    a regular visitor's session could silently expire without ever being
 *    refreshed, since nothing else in the app touches the session cookie.
 *
 * 2. Gate the admin dashboard and its data API behind a real Supabase login
 *    AND the admin_users allowlist:
 *    - /admin/**            → redirect to /admin/login if not signed in
 *    - /api/admin/**        → 401 JSON if not signed in
 *    - /admin/login itself is always reachable (otherwise no one could log in)
 */
export async function middleware(request: NextRequest) {
  /* ------------------------------------------------------------------------
   * ENFORCE HTTPS (STAB-01, confirmed live 31 Aug 2026).
   *
   * http://cinetonight.com served the full page directly with zero redirect
   * — Cloudflare's edge-level "Always Use HTTPS" is off for this zone, and
   * nothing downstream replaced it, so the plaintext origin has been a live
   * duplicate of every URL on the site (and every cookie including the
   * Supabase session cookie could travel unencrypted on it).
   *
   * A real 308 here, not an in-render redirect: see the genre block below
   * for why `permanentRedirect()` inside a page returns HTTP 200 with a
   * client-side payload on this stack rather than an actual redirect.
   * Middleware is the one layer where a redirect is a real HTTP redirect.
   *
   * Runs before every other check, including the path guard: an insecure
   * request should never reach guardPath, genre canonicalisation or the
   * Supabase session refresh below — it should just be told to come back
   * over HTTPS. `port` is cleared so a request that somehow arrived with an
   * explicit port doesn't redirect to "https://cinetonight.com:80".
   *
   * Skipped in development: `next dev` serves plain HTTP with no local TLS
   * listener, so this would otherwise redirect every local request to an
   * https://localhost URL nothing is listening on. `next build`/the
   * deployed Worker both run with NODE_ENV=production, so this never
   * weakens the production behaviour above.
   * --------------------------------------------------------------------- */
  if (process.env.NODE_ENV !== "development" && request.nextUrl.protocol === "http:") {
    const secure = request.nextUrl.clone();
    secure.protocol = "https:";
    secure.port = "";
    return NextResponse.redirect(secure, 308);
  }

  const response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname } = request.nextUrl;

  /* ------------------------------------------------------------------------
   * R2 CONTAINMENT (Phase 4B-2).
   *
   * Measured: an invented slug on an ISR route makes Next render the not-found
   * result and PERSIST it — one R2 object per invented URL, 77 KB and up, on
   * an unbounded URL space. Twenty junk requests produced twenty permanent
   * objects. That is the mechanism that took the bucket to 2.79M objects.
   *
   * The write happens because the route RENDERED, so the check has to be
   * BEFORE rendering — which means here. A request answered in middleware
   * never reaches the route and never creates a cache entry.
   *
   * It only rejects what CANNOT be real: a malformed TMDB id, an id above the
   * plausible ceiling, an over-long segment, or characters no slug this site
   * generates contains. An unknown-but-well-formed slug is passed through,
   * because the catalogue and the blog grow from the dashboard and middleware
   * cannot see the database. Rejecting something valid would take a real page
   * off the site; letting something invalid through costs one cache object.
   *
   * Pure string work — a regex and a length check. No database, no network,
   * nothing that can throw. See lib/pathGuard.ts.
   * --------------------------------------------------------------------- */
  const impossible = guardPath(pathname);
  if (impossible) {
    return new NextResponse(null, {
      status: 404,
      headers: {
        // Never cache this anywhere: the whole point is that it costs nothing
        // to answer, and a cached 404 for an unbounded URL space is the
        // problem we are removing rather than a smaller version of it.
        "cache-control": "no-store",
        "x-cinetonight-guard": impossible,
      },
    });
  }

  /* ------------------------------------------------------------------------
   * ONE URL PER GENRE — a real 308, before anything renders. (Phase 4A)
   *
   * /movies?genre=<anything> used to return 200 with a UNIQUE self-canonical
   * and a unique <title> while rendering the plain unfiltered hub. Five hubs
   * times an unlimited set of values is an unbounded space of indexable
   * duplicates. Same for TMDB's TV-side names ("Action & Adventure"), which
   * do not filter a movie query — the sitemap was submitting one of those.
   *
   * WHY MIDDLEWARE AND NOT THE PAGE: this was implemented in the page first
   * and then measured in the real Cloudflare Worker. An in-render
   * `permanentRedirect()` there returns HTTP **200** with a client-side
   * redirect payload, not a 308 — the same class of problem as `notFound()`
   * returning 200. Middleware is the only layer on this stack where a
   * redirect is an actual HTTP redirect (verified: `next.config.mjs`'s /p/
   * rule and this block both emit real 308s).
   *
   * WHY NOT A 404 for an unknown genre: `notFound()` is a soft 404 here — a
   * 200 that Google reports as an error. A redirect removes the duplicate
   * outright, lands the visitor on a page that works, and consolidates any
   * standing the junk URL picked up. That is strictly better than either a
   * soft 404 or a noindex.
   *
   * COST AND SAFETY: a Set lookup on the pathname, then one lookup in a
   * hard-coded static table. No database, no network, no await, no
   * user-supplied patterns, and nothing here can throw — the whole site
   * passes through this function, so that matters more than the feature does.
   * It runs before the Supabase work below, so a redirected request never
   * pays for a session refresh either.
   * --------------------------------------------------------------------- */
  if (GENRE_HUBS.has(pathname)) {
    const raw = request.nextUrl.searchParams.get("genre");
    if (raw !== null) {
      const canonical = canonicalGenre(raw);
      if (canonical !== raw) {
        const target = request.nextUrl.clone();
        // An unrecognised genre drops the parameter entirely rather than
        // guessing at a replacement — the bare hub is the honest destination.
        if (canonical) target.searchParams.set("genre", canonical);
        else target.searchParams.delete("genre");
        // 308, not 307: this is a permanent statement about which URL owns
        // the page, which is the half that consolidates ranking signals.
        return NextResponse.redirect(target, 308);
      }
    }
  }

  const isApi = pathname.startsWith("/api/admin/");
  const isDashboard = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (!url || !key) {
    // Supabase isn't configured yet — fail closed on the routes that need
    // real auth, but don't break the rest of the (file-based) admin routes.
    if (isApi) return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
    if (isDashboard) return response;
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        request.cookies.set({ name, value, ...options });
        // @supabase/ssr's default cookie options leave httpOnly unset
        // (false), which lets any JS on the page — including an XSS
        // payload from an unrelated page, since this cookie is site-wide —
        // read the live session token via document.cookie. Force it on.
        // `secure` is likewise forced only in production so local `next
        // dev` over plain http still works.
        response.cookies.set({
          name,
          value,
          ...options,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" ? true : options?.secure,
        });
      },
      remove(name: string, options: any) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({
          name,
          value: "",
          ...options,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" ? true : options?.secure,
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (!user && isApi) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!user && isDashboard) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Being signed in to Supabase Auth is NOT the same as being an admin — the
  // site also has public /signin + /signup pages, and any account created
  // through those would otherwise pass the `!!user` check above and reach
  // the dashboard. Cross-check against the admin_users allowlist (see
  // supabase/schema.sql) before granting access.
  if (user && (isApi || isDashboard)) {
    const { data: allowed } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!allowed) {
      // Signed in, but not on the allowlist — sign them out so they don't
      // get stuck in a "logged in but nothing works" state, then deny.
      await supabase.auth.signOut();
      if (isApi) return NextResponse.json({ error: "This account is not authorized for the dashboard." }, { status: 403 });
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("err", "unauthorized");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  // Everything except static assets / generated image & manifest routes —
  // the standard @supabase/ssr "run on every request" matcher, so session
  // refresh (job 1 above) actually covers the whole site, not just /admin.
  matcher: [
    // Excluded, on top of static assets and generated image routes: the
    // public read-only API endpoints. They never read a Supabase session
    // (watch availability, search, browse, title lookup, trailers, mood are
    // all anonymous), so running session-refresh in front of them was pure
    // Worker CPU on the site's highest-volume routes. /api/admin/** and
    // /api/comments still pass through, because that is where the gate lives.
    "/((?!_next/static|_next/image|favicon.ico|icon|opengraph-image|manifest.webmanifest|api/(?:watch|search|browse|title|tv|trailer|mood)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
