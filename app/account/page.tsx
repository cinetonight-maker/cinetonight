import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

// Same reasoning as /search: a signed-out crawler never sees real content
// here (redirected to /signin), so it shouldn't be indexed even though the
// page itself has to keep working for real signed-in visitors.
export const metadata: Metadata = { title: "My Account", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await supabaseServer();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = data.user;
  if (!user) redirect("/signin?next=/account");

  const name = (user.user_metadata as { full_name?: string } | null)?.full_name;

  return (
    <div className="page">
      <div className="auth">
        <h1>My Account</h1>
        <p className="sub">{name ? `Hi, ${name}.` : "You're signed in."}</p>
        <div style={{ background: "var(--bg2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13.5, color: "var(--muted)" }}>
          Signed in as <span style={{ color: "var(--txt)" }}>{user.email}</span>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
