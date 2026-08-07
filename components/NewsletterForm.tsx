"use client";

import { useState, type FormEvent } from "react";

/** The "Never miss a premiere" sidebar widget used to end in a <button
 *  type="button"> with no onClick at all — every email a visitor typed in
 *  just vanished on click. This is the real, working version: posts to
 *  /api/subscribers, which writes into the new `subscribers` table. */
export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setState("done");
      setMessage(data.message || "You're subscribed!");
      setEmail("");
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  }

  if (state === "done") {
    return <p style={{ color: "#c8f0d8", fontSize: 12.5 }}>{message}</p>;
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        type="email"
        placeholder="you@email.com"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={state === "busy"}
      />
      <button type="submit" disabled={state === "busy"}>
        {state === "busy" ? "Subscribing…" : "Subscribe"}
      </button>
      {state === "error" && <p style={{ color: "#f0a8a8", fontSize: 12, marginTop: 6 }}>{message}</p>}
    </form>
  );
}
