"use client";

import { useEffect } from "react";

/** Root error boundary — catches any uncaught error thrown while rendering
 *  a Server or Client Component below this point (a bad fetch, a null
 *  dereference, etc.) and shows a recoverable screen instead of the blank
 *  white page / raw stack trace Next.js would otherwise ship in production. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server Components' error digest is safe to log client-side; the full
    // message/stack is already stripped by Next.js in production builds.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="page">
      <div className="nf">
        <h1>Oops</h1>
        <p>Something went wrong loading this page.</p>
        <button className="btn btn--play" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
