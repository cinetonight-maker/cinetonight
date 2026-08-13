import Link from "next/link";
import type { Metadata } from "next";
import SignInForm from "@/components/SignInForm";
export const metadata: Metadata = { title: "Sign In" };
export default function Page() {
  return (
    <div className="page">
      <div className="auth">
        <h1>Welcome back</h1>
        <p className="sub">Sign in to continue to CineTonight.</p>
        <SignInForm />
        <div className="auth__alt">New here? <Link href="/signup">Create an account</Link></div>
      </div>
    </div>
  );
}
