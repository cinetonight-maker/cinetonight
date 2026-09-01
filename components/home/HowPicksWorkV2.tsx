import Link from "next/link";

/** V2-only static section (canvas "How Picks Work"). Explains the pick in
 *  plain words right after the picker — pure server HTML, zero fetches, no
 *  claims the engine doesn't honour: mood/time/company narrowing, strict
 *  filters excluding unknowns, and a stated reason on every lead pick are
 *  all real behaviour of PickStudio + /api/recommend. The method link goes
 *  to the existing decision guide — no new URL. */
export default function HowPicksWorkV2() {
  return (
    <section className="v2hp" aria-labelledby="v2hp-h">
      <div>
        <p className="v2hp-kicker">How picks work</p>
        <h2 id="v2hp-h" className="v2hp-h">A reason, not a mystery score.</h2>
        <p className="v2hp-sub">
          CineTonight combines verified title facts with what you tell us about
          tonight. Availability is checked separately and shown for your
          country, never guessed.
        </p>
        <Link className="v2hp-link" href="/blog/what-should-i-watch-tonight">Read how we decide →</Link>
      </div>
      <div className="v2hp-steps">
        <div className="v2hp-step">
          <span className="v2hp-n" aria-hidden="true">01</span>
          <div><strong>You set the night</strong><p>Mood, time and company narrow the problem.</p></div>
        </div>
        <div className="v2hp-step">
          <span className="v2hp-n" aria-hidden="true">02</span>
          <div><strong>We check eligibility</strong><p>A title with unknown runtime or availability cannot satisfy a strict filter.</p></div>
        </div>
        <div className="v2hp-step">
          <span className="v2hp-n" aria-hidden="true">03</span>
          <div><strong>You see the reason</strong><p>Every lead choice explains the fit and the tradeoff.</p></div>
        </div>
      </div>
    </section>
  );
}
