"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
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
    router.push(params.get("next") || "/admin");
    router.refresh();
  };

  return (
    <div className="page" style={{ maxWidth: 380, margin: "80px auto" }}>
      <form onSubmit={submit} className="ad__panel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Dashboard sign in</h1>
        <label className="ad__field">
          <span>Email</span>
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="ad__field">
          <span>Password</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <div className="ad__err" style={{ margin: 0 }}>{err}</div>}
        <button className="ad__btn ad__btn--primary" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
