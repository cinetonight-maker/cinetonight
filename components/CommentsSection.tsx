"use client";

import { useEffect, useState, type FormEvent } from "react";
import Stars from "./Stars";
import type { Movie } from "@/lib/types";

interface Comment {
  id: string;
  name: string;
  body: string;
  rating: number | null;
  created_at: string;
}

/** Real visitor comments for this title — replaces what used to be a single
 *  hardcoded REVIEWS array (lib/data.ts) rendered identically on every
 *  movie's page, regardless of which movie it was. The backend
 *  (/api/comments + admin moderation in the dashboard) already existed and
 *  worked; nothing on the public site ever called it. New comments land as
 *  "pending" and only appear here once approved from the dashboard, same
 *  spam-prevention model as before — just now actually wired up. */
export default function CommentsSection({ movie }: { movie: Movie }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/comments?movieId=${encodeURIComponent(movie.id)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setComments(d.comments ?? []); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [movie.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    setState("busy");
    setMessage("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId: movie.id, name, rating, body: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Something went wrong.");
      setState("done");
      setMessage(data.message || "Thanks! Your comment will appear once it's approved.");
      setName(""); setText(""); setRating(5);
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  }

  const count = comments?.length ?? 0;

  return (
    <section className="sec">
      <div className="sec__head">
        <h2>User Reviews {comments !== null && <span style={{ color: "var(--muted)", fontWeight: 500 }}>({count})</span>}</h2>
      </div>
      <div className="revwrap">
        <div className="revscore">
          <div className="revscore__n">{movie.rating.toFixed(1)}</div>
          <div className="revscore__stars"><Stars rating={Math.round(movie.rating / 2)} /></div>
          <div className="revscore__sub">Community rating</div>
        </div>
        <div className="revlist">
          {comments === null && <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading reviews…</p>}
          {comments !== null && comments.length === 0 && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>No reviews yet — be the first to share your thoughts on {movie.title}.</p>
          )}
          {comments?.map((c) => (
            <div className="rev" key={c.id}>
              <div className="rev__top">
                <div className="rev__ava rev__ava--fallback">{c.name.trim().charAt(0).toUpperCase() || "?"}</div>
                <div>
                  <div className="rev__name">{c.name}</div>
                  {c.rating ? <div className="rev__stars"><Stars rating={c.rating} /></div> : null}
                </div>
                <span className="rev__when">{new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
              <p className="rev__text">{c.body}</p>
            </div>
          ))}

          <form className="rev__form" onSubmit={onSubmit}>
            <div className="rev__form-h">Leave a review</div>
            <div className="rev__form-row">
              <input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                required
                disabled={state === "busy"}
              />
              <div className="rev__form-stars" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    aria-pressed={rating === n}
                    className={`rev__form-star${n <= rating ? " on" : ""}`}
                    onClick={() => setRating(n)}
                    disabled={state === "busy"}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <textarea
              placeholder={`What did you think of ${movie.title}?`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              rows={3}
              required
              disabled={state === "busy"}
            />
            <button className="rev__form-submit" type="submit" disabled={state === "busy"}>
              {state === "busy" ? "Posting…" : "Post Review"}
            </button>
            {message && (
              <p style={{ color: state === "error" ? "#f0a8a8" : "#c8f0d8", fontSize: 12.5, marginTop: 8 }}>{message}</p>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
