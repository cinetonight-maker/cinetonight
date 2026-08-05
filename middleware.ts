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

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
