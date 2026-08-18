"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_EVENT } from "@/lib/auth";

/** Was a static form with no onSubmit — "Create Account" did nothing.
 *  Handles both possible project configurations: if the Supabase project
 *  has email confirmation OFF, signUp() returns a live session immediately
 *  and this signs the visitor straight in. If it's ON (the default), no
 *  session comes back yet — this shows a "check your email" message
 *  instead of treating that as an error. */
export default function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    setBusy(false);
    if (error) {
      setErr(error.message === "User already registered" ? "An account with that email already exists." : error.message);
      return;
    }
    if (data.session) {
      window.dispatchEvent(new Event(AUTH_EVENT)); // see lib/auth.tsx
      router.push("/");
      router.refresh();
      return;
    }
    // signUp() succeeded but no session came back — the project requires
    // email confirmation before first sign-in.
    setNeedsConfirm(true);
  };

  if (needsConfirm) {
    return (
      <p style={{ color: "var(--txt)", fontSize: 14, lineHeight: 1.6 }}>
        Almost there — we sent a confirmation link to <b>{email}</b>. Click it, then come back and sign in.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <label>Name</label>
      <input placeholder="Your name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
      <label>Email</label>
      <input type="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <label>Password</label>
      <input type="password" placeholder="Create a password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      {err && <p style={{ color: "#f0a8a8", fontSize: 12.5, marginTop: 10 }}>{err}</p>}
      <button className="auth__btn" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create Account"}</button>
    </form>
  );
}
