import type { Metadata } from "next";
import Link from "next/link";
import { baseUrl } from "@/lib/site";
import { breadcrumbJsonLd } from "@/lib/breadcrumbs";

const TITLE = "FAQ: How CineTonight Works";
const DESCRIPTION =
  "Answers to common questions about CineTonight: what it is, how Where to Watch finds streaming availability in your country, how the free classic movies are legal, and more.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${baseUrl()}/faq` },
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", url: `${baseUrl()}/faq` },
};
export const revalidate = 3600;

/** Every answer is written snippet-first: a direct answer in the opening
 *  sentence, 40 to 60 words total, because that is what Google lifts into
 *  People Also Ask boxes and what AI answer engines quote. */
const FAQS: { q: string; a: string; links?: [string, string][] }[] = [
  {
    q: "What is CineTonight?",
    a: "CineTonight is a movie and series discovery site that answers one question: what should I watch tonight? It brings trailers, ratings, live Top 10s, new OTT release updates, and country-specific streaming availability together on one page, so you decide in minutes instead of scrolling for an hour.",
  },
  {
    q: "Is CineTonight free to use?",
    a: "Yes, completely. Browsing, trailers, ratings, Top 10s, the watchlist, and the free classic movies all cost nothing and need no signup. Creating an account is optional and only adds syncing your watchlist across devices.",
  },
  {
    q: "Can I watch full movies on CineTonight?",
    a: "You can watch trailers for every title, and full classic films in our Free Movies section, which are in the public domain and streamed legally. For everything else, CineTonight shows you exactly which platform carries the title in your country and links you straight there. We never host or link to pirated copies of anything.",
    links: [["Browse the Free Movies section", "/free-movies"]],
  },
  {
    q: "How are the free classic movies legal?",
    a: "In India a film's copyright lasts 60 years, so golden age classics have entered the public domain and belong to everyone. The prints are preserved and streamed by the nonprofit Internet Archive or by rights holders' own official channels, and we embed their players directly. Every film is hand checked before it appears.",
    links: [["Read the full explanation", "/free-movies"]],
  },
  {
    q: "How does Where to Watch know what is available in my country?",
    a: "The Where to Watch panel on every title page uses live availability data, sourced from JustWatch via TMDB, matched to the country you are browsing from. An Indian visitor sees JioHotstar and ZEE5 options, a visitor from Pakistan sees what is actually available there, and so on. It refreshes continuously as licensing changes.",
  },
  {
    q: "Why is a movie available in one country but not mine?",
    a: "Streaming rights are sold country by country, so the same film can legitimately belong to different platforms in different places, or be unavailable in yours while a license is unsold. Rights also move: a title missing today can appear next month, so check its page again.",
  },
  {
    q: "How do I find out when a movie is coming to OTT?",
    a: "Our blog tracks OTT release dates for major films, with each post updated the moment a platform confirms the date. Following CineTonight on Instagram, Facebook, or TikTok gets you the announcements as they happen.",
    links: [["Visit the blog", "/blog"], ["Follow CineTonight", "/follow"]],
  },
  {
    q: "How does the watchlist work?",
    a: "Tap Add to Watchlist on any title and it is saved in your browser instantly, no account needed. Everything you save appears under My List. If you create a free account and sign in, your list syncs across your devices and nothing you saved is lost.",
    links: [["Open My List", "/my-list"]],
  },
  {
    q: "Can I request a movie or report a mistake?",
    a: "Yes, and we read everything. Use the contact page or email officialcinetonight@gmail.com for title requests, corrections, availability errors, or copyright concerns. Rights holder reports are reviewed promptly.",
    links: [["Go to the contact page", "/contact"]],
  },
  {
    q: "How are comments and reviews moderated?",
    a: "Every comment lands in a moderation queue first and appears only after a human approves it. That keeps reviews genuine and spam free. Posting needs no account, just a name and your thoughts.",
  },
  {
    q: "Does CineTonight have a mobile app?",
    a: "Not yet, and you do not need one: the site is built mobile first and works like an app in any phone browser. Choose Add to Home Screen in your browser menu and CineTonight installs with its own icon and full screen view.",
  },
  {
    q: "How does CineTonight make money?",
    a: "Some Where to Watch links may be affiliate links, meaning a platform can pay us a small commission if you subscribe through them, at no extra cost to you. Affiliate links never change what we show: availability comes from live data, not from who pays.",
  },
];

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const crumbs = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "FAQ" }]);

  return (
    <div className="page">
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD built above */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      {/* eslint-disable-next-line react/no-danger -- static JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs).replace(/</g, "\\u003c") }} />

      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <span className="cur">FAQ</span>
      </div>
      <div className="page__head">
        <h1>Frequently Asked Questions</h1>
        <p>Everything about how CineTonight works, answered plainly. Can&apos;t find yours? <Link href="/contact">Ask us directly</Link>.</p>
      </div>

      <div className="faqlist">
        {FAQS.map((f) => (
          <section className="faqitem" key={f.q}>
            <h2>{f.q}</h2>
            <p>{f.a}</p>
            {f.links && (
              <p className="faqitem__links">
                {f.links.map(([label, href]) => (
                  <Link key={href} href={href}>{label}</Link>
                ))}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
