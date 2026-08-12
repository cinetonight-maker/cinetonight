"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="auth__btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabaseBrowser().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign Out"}
    </button>
  );
}
