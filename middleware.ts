import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  const response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const { pathname } = request.nextUrl;

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
