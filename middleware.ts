import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Gates the admin dashboard and its data API behind a real Supabase login.
 * - /admin/**            → redirect to /admin/login if not signed in
 * - /api/admin/**        → 401 JSON if not signed in
 * - /admin/login itself is always reachable (otherwise no one could log in)
 *
 * Also refreshes the Supabase session cookie on every matched request, per
 * the standard @supabase/ssr middleware pattern — without this, sessions
 * silently expire and admins get logged out mid-session.
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
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        request.cookies.set({ name, value: "", ...options });
        response.cookies.set({ name, value: "", ...options });
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
  // site also has (currently unwired) public /signin + /signup pages, and
  // any account created through those would otherwise pass the `!!user`
  // check above and reach the dashboard. Cross-check against the admin_users
  // allowlist (see supabase/schema.sql) before granting access.
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
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
