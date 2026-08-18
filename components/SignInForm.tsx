"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_EVENT } from "@/lib/auth";
import { safeNextPath } from "@/lib/site";

/** Was a static form with no onSubmit at all — clicking "Sign In" did
 *  nothing. Mirrors app/admin/login's real Supabase Auth pattern, just
 *  without the admin_users allowlist check (any real account can sign in
 *  here; only the dashboard is gated). */
export default function SignInForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setErr(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      return;
    }
    // Tell the (lazily-connected) AuthProvider a session now exists - it
    // does not remount on this soft navigation. See lib/auth.tsx.
    window.dispatchEvent(new Event(AUTH_EVENT));
    router.push(safeNextPath(params.get("next"), "/"));
    router.refresh();
  };

  return (
    <form onSubmit={submit}>
      <label>Email</label>
      <input type="email" placeholder="you@email.com" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <label>Password</label>
      <input type="password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      {err && <p style={{ color: "#f0a8a8", fontSize: 12.5, marginTop: 10 }}>{err}</p>}
      <button className="auth__btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign In"}</button>
    </form>
  );
}
