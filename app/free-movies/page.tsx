import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import { getClassicsEnriched } from "@/lib/classics";
import { baseUrl } from "@/lib/site";

// Cached (ISR): rendered once, reused for 3600s, then refreshed in the
// background. Turns bot storms into cache hits instead of function runs.
export const revalidate = 86400;

// "Legally" is the keyword that separates this page's SERP from the piracy
// swamp — searchers who type it are exactly the visitors we want, and
// Google's results for it are thin, credible sites.
const TITLE = "Free Classic Bollywood Movies: Watch Online Legally";
const DESCRIPTION =
  "Watch full classic Bollywood movies free and 100% legally: Awaara, Pyaasa, Mughal-e-Azam and more, streaming from the public domain. No signup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${baseUrl()}/free-movies` },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: `${baseUrl()}/free-movies` },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

// The explainer section below already answers these questions in prose;
// FAQPage schema makes the same answers machine-extractable — eligible for
// Google featured snippets, People Also Ask, and voice answers (AEO).
const FAQ = [
  {
    q: "Is it legal to watch these movies for free?",
    a: "Yes. Every film on this page is in the public domain: in India a film's copyright lasts 60 years, so golden-age classics have outlived their protection and belong to everyone. Watching them is as legal as watching a trailer.",
  },
  {
    q: "Where are these free movies streamed from?",
    a: "The prints are preserved and streamed by the nonprofit Internet Archive, or by rights holders' own official YouTube channels. We embed their players directly, and nothing is hosted on our servers.",
  },
  {
    q: "Do I need an account or payment to watch?",
    a: "No. Every film on this page plays free, with no signup, subscription, or payment of any kind.",
  },
];

export default async function FreeMoviesPage() {
  const classics = await getClassicsEnriched();

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD, not user input */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }).replace(/</g, "\\u003c"),
        }}
      />
      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <span className="cur">Free Movies</span>
      </div>

      <div className="page__head">
        <h1>Watch Free Movies, Legally</h1>
        <p>
          Full classic films you can watch right here, right now. Every title on this page is in the
          public domain or officially released for free viewing — no signup, no piracy, no catch.
        </p>
      </div>

      {classics.length > 0 ? (
        <section className="sec">
          <div className="grid">
            {classics.map(({ classic, movie, posterUrl }) => (
              <Link key={classic.slug} className="fmc" href={`/free-movies/${classic.slug}`}>
                <div className="fmc__poster">
                  <Image fill alt={`${classic.title} (${classic.year}) poster`} src={posterUrl} sizes="(max-width: 760px) 45vw, 180px" />
                  <span className="fmc__badge">FREE</span>
                  <span className="fmc__play"><Icon name="play" size={18} /></span>
                </div>
                <div className="fmc__t">{classic.title}</div>
                <div className="fmc__m">
                  {[classic.year, classic.genre, movie ? `★ ${movie.rating.toFixed(1)}` : null].filter(Boolean).join(" · ")}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty">The free classics shelf is being stocked. Check back soon.</div>
      )}

      {/* Plain-language legality explainer — builds visitor trust AND gives
          this page real, unique text content to rank on (thin pages of pure
          poster grids don't rank; a page that answers "how is this legal?"
          does). Keyword-bearing by design: "watch old Hindi movies online
          free", "classic Bollywood movies", "public domain", "legally". */}
      <section className="sec fm__explain">
        <div className="sec__head"><h2>Watch classic Bollywood movies free — here&apos;s why it&apos;s 100% legal</h2></div>
        <p>
          In India, a film&apos;s copyright lasts <strong>60 years</strong>. That means the entire golden
          age of Hindi cinema — Raj Kapoor and Nargis, Guru Dutt, Madhubala, Dilip Kumar, Dev Anand —
          is now in the <strong>public domain</strong>: these films belong to everyone, and watching
          them free is every bit as legal as watching a trailer. No piracy, no shady mirrors, no
          &quot;HD print leaked&quot; nonsense — just heritage cinema that has outlived its copyright.
        </p>
        <p>
          The prints are preserved and streamed by the nonprofit{" "}
          <a href="https://archive.org" target="_blank" rel="noopener noreferrer">Internet Archive</a>{" "}
          (and, for some titles, the rights holders&apos; own official YouTube channels) — we embed
          their players directly, the same way any YouTube video embeds. Nothing is hosted on our
          servers, no one&apos;s rights are infringed, and you never pay a rupee or make an account.
        </p>
        <p>
          Every film on this shelf is hand-checked by our editors before it appears — both that the
          print actually plays and that the film is genuinely out of copyright. Spot a problem, or think
          a title isn&apos;t public domain in your region? <Link href="/contact">Contact us</Link> and
          we&apos;ll review it promptly.
        </p>
      </section>
    </div>
  );
}
