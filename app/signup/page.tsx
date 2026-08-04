import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sign Up" };
export default function Page() {
  return (
    <div className="page">
      <div className="auth">
        <h1>Create your account</h1>
        <p className="sub">Start watching in minutes.</p>
        <label>Name</label><input placeholder="Your name" />
        <label>Email</label><input type="email" placeholder="you@email.com" />
        <label>Password</label><input type="password" placeholder="Create a password" />
        <button className="auth__btn">Create Account</button>
        <div className="auth__alt">Already have an account? <Link href="/signin">Sign in</Link></div>
      </div>
    </div>
  );
}
