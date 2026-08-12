import Link from "next/link";
import type { Metadata } from "next";
import SignUpForm from "@/components/SignUpForm";
export const metadata: Metadata = { title: "Sign Up" };
export default function Page() {
  return (
    <div className="page">
      <div className="auth">
        <h1>Create your account</h1>
        <p className="sub">Start watching in minutes.</p>
        <SignUpForm />
        <div className="auth__alt">Already have an account? <Link href="/signin">Sign in</Link></div>
      </div>
    </div>
  );
}
