import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sign In" };
export default function Page() {
  return (
    <div className="page">
      <div className="auth">
        <h1>Welcome back</h1>
        <p className="sub">Sign in to continue to MOVIEX.</p>
        <label>Email</label><input type="email" placeholder="you@email.com" />
        <label>Password</label><input type="password" placeholder="••••••••" />
        <button className="auth__btn">Sign In</button>
        <div className="auth__alt">New here? <Link href="/signup">Create an account</Link></div>
      </div>
    </div>
  );
}
