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
    return <p className="nlform__ok">{message}</p>;
  }

  // The classes matter: this form renders in two very different containers
  // (the purple .news sidebar widget and the homepage .nlcta banner), so it
  // carries its own styling instead of relying on parent descendant selectors
  // - that reliance is exactly why it rendered as bare browser widgets on the
  // redesigned homepage.
  return (
    <form className="nlform" onSubmit={onSubmit}>
      <div className="nlform__row">
        <input
          className="nlform__input"
          type="email"
          placeholder="you@email.com"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={state === "busy"}
        />
        <button className="nlform__btn" type="submit" disabled={state === "busy"}>
          {state === "busy" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {state === "error" && <p className="nlform__err">{message}</p>}
    </form>
  );
}
