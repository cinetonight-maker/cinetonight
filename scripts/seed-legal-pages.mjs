// Creates (or updates) the four "must have before launch" info pages —
// About Us, Contact, Privacy Policy, Terms of Service — in Supabase's
// `pages` table, published and ready to render at /p/<slug>. Also adds
// matching entries to `nav_links` (footer_legal / footer_support) so the
// footer's Terms of Service / Privacy Policy / Contact Us links point at
// real pages instead of the current "#" placeholders.
//
// Safe to re-run: pages are upserted by slug, and the nav_link rows are
// upserted by (location, label) so running this twice never creates
// duplicates. Editing app/globals.css or the content below and re-running
// updates the live pages in place.
//
// Usage:  node scripts/seed-legal-pages.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket } from "ws";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — fine if the vars are already in the environment */
  }
}
loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (check .env.local).");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket },
});

// Change this if you'd rather a different inbox got Contact / DMCA mail —
// it's baked into the Contact page text below, so edit here and re-run.
const CONTACT_EMAIL = "helloqaisarumar@gmail.com";
const TODAY = new Date().toISOString().slice(0, 10);

const PAGES = [
  {
    slug: "about-us",
    title: "About Us",
    content: `# About MOVIEX

MOVIEX is a personal, non-commercial project built for discovering movies, web series, K-Dramas, anime and more — trailers, ratings, cast, and where to watch each title, all in one place.

## What MOVIEX is

MOVIEX pulls posters, synopses, ratings and cast information from [The Movie Database (TMDB)](https://www.themoviedb.org/), embeds official trailers from YouTube, and links out to the legitimate platforms (Netflix, Prime Video, and others) that actually carry each title.

## What MOVIEX is not

MOVIEX does **not** host, stream, or distribute any full movie or TV episode. Clicking "Watch Now" on a title opens its trailer — it never plays pirated or unlicensed content, and it never claims to be an official service of any studio, network, or streaming platform it links to or mentions.

## Data sources

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Questions?

Reach out any time on the [Contact page](/contact) — see also our [Privacy Policy](/privacy-policy) and [Terms of Service](/terms-of-service).

*Last updated: ${TODAY}.*`,
  },
  {
    slug: "contact",
    title: "Contact",
    content: `# Contact Us

Have a question, spotted a bug, or want to report something? We'd like to hear from it.

## Email

**${CONTACT_EMAIL}**

We read every message and try to reply within a few days. For fastest handling, please include:

- What page or title you were on (a link helps a lot)
- What you expected to happen vs. what actually happened
- A screenshot, if it's a visual bug

## Copyright / takedown requests

If you're a rights holder with a concern about a trailer, poster, or piece of listing data, email the address above with the title in question and a description of the concern, and it will be looked at promptly. See also our [Terms of Service](/terms-of-service) for how MOVIEX sources and uses this content.

## Business & press

Same address — just say what it's regarding in the subject line.

*Last updated: ${TODAY}.*`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    content: `# Privacy Policy

*Last updated: ${TODAY}*

This page explains what information MOVIEX collects, why, and how it's handled. MOVIEX is a personal, non-commercial project — this policy is written in plain language rather than dense legal boilerplate, but it's accurate to how the site actually works.

## Information we collect

**Account information.** If you create an account, we store the email address and display name you provide, handled through our authentication provider (Supabase). Passwords are never stored or seen by us in plain text.

**Your watchlist ("My List").** If you're signed in, the titles you add to your list are stored against your account so they follow you across devices. If you're not signed in, your list is kept only in your browser's local storage and never leaves your device.

**Comments and ratings.** If you leave a comment or rating on a title, we store the name you typed, the comment text, and the rating. Comments are reviewed before they appear publicly.

**Newsletter signup.** If you subscribe, we store the email address you provide, solely to send you updates. You can ask to be removed at any time.

**Automatically collected data.** Like most websites, our hosting and analytics providers may log standard technical information (e.g. IP address, browser type, pages visited) for security and performance purposes.

## What we don't do

We don't sell your personal information, and we don't share it with advertisers for targeted ad profiles. We don't collect payment information — MOVIEX doesn't process any payments.

## Third parties

MOVIEX embeds trailers from **YouTube** and pulls listing data from **TMDB**; visiting a page that loads either may be subject to that provider's own privacy policy. Where MOVIEX links out to a streaming platform (e.g. "Watch on Netflix"), that platform's own privacy policy applies once you leave MOVIEX.

## Your choices

You can edit or delete your account data, request a copy of what we hold, or ask us to delete it entirely, by emailing [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). Signed-out visitors can clear their local watchlist any time by clearing their browser's site data.

## Children's privacy

MOVIEX is not directed at children under 13, and we don't knowingly collect personal information from them.

## Changes to this policy

If this policy changes in a meaningful way, the "Last updated" date above will change. Continued use of the site after an update means you accept the revised policy.

## Contact

Questions about this policy? See our [Contact page](/contact) or email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    content: `# Terms of Service

*Last updated: ${TODAY}*

Welcome to MOVIEX. By using this site, you agree to the terms below. If you don't agree, please don't use the site.

## What MOVIEX provides

MOVIEX is a discovery and information site for movies, web series, K-Dramas, anime and more. It shows trailers, ratings, cast details, and where a title is legitimately available to watch. **MOVIEX does not host, stream, sell, or distribute any copyrighted movie or TV episode.** Trailers are embedded from YouTube; listing data (titles, posters, cast, ratings) is sourced from TMDB. Links to streaming platforms (Netflix, Prime Video, and others) take you to those platforms' own sites or apps to actually watch — MOVIEX has no control over, and makes no guarantee about, the availability of a title on any third-party platform.

## Accounts

You're responsible for keeping your account credentials secure and for anything that happens under your account. You must provide accurate information when creating an account, and you may not impersonate another person or entity.

## Acceptable use

You agree not to:

- Use MOVIEX for anything unlawful, or to infringe anyone else's rights
- Attempt to scrape, reverse-engineer, or overload the service beyond normal personal use
- Post comments that are abusive, defamatory, spam, or infringe someone else's copyright
- Attempt to bypass any security or rate-limiting measures on the site

We reserve the right to remove content or suspend accounts that violate these terms.

## Content and copyright

Movie/TV posters, backdrops, and metadata are provided by TMDB; trailer video is provided by YouTube and remains the property of its respective owners. All trademarks, service marks, and studio/platform names mentioned belong to their respective owners — MOVIEX's use of them is for identification purposes only and doesn't imply endorsement or affiliation.

If you believe content on MOVIEX infringes your copyright, contact us at [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) with details and it will be reviewed and removed if warranted.

## No warranty

MOVIEX is provided "as is," as a personal project, without warranties of any kind. Ratings, availability, and "where to watch" information are sourced from third parties and may be inaccurate or out of date. We don't guarantee the site will be error-free, uninterrupted, or available at all times.

## Limitation of liability

To the fullest extent permitted by law, MOVIEX and its creator are not liable for any indirect, incidental, or consequential damages arising from your use of the site, including reliance on any information it displays.

## Changes to these terms

We may update these terms from time to time; the "Last updated" date above reflects the latest revision. Continuing to use MOVIEX after a change means you accept the updated terms.

## Contact

Questions about these terms? See our [Contact page](/contact) or email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).`,
  },
];

const NAV_LINKS = [
  { location: "footer_legal", label: "Privacy Policy", url: "/privacy-policy", sort_order: 1, is_external: false },
  { location: "footer_legal", label: "Terms of Service", url: "/terms-of-service", sort_order: 2, is_external: false },
  { location: "footer_support", label: "Contact Us", url: "/contact", sort_order: 1, is_external: false },
];

try {
  for (const p of PAGES) {
    const { error } = await supabase
      .from("pages")
      .upsert(
        { slug: p.slug, title: p.title, content: p.content, status: "published", updated_at: new Date().toISOString() },
        { onConflict: "slug" },
      );
    if (error) throw new Error(`page "${p.slug}": ${error.message}`);
    console.log(`✓ /p/${p.slug} — ${p.title}`);
  }

  for (const link of NAV_LINKS) {
    // No unique constraint on (location, label) to upsert against, so check-then-write.
    const { data: existing } = await supabase
      .from("nav_links")
      .select("id")
      .eq("location", link.location)
      .eq("label", link.label)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("nav_links").update(link).eq("id", existing.id);
      if (error) throw new Error(`nav_link "${link.label}": ${error.message}`);
    } else {
      const { error } = await supabase.from("nav_links").insert(link);
      if (error) throw new Error(`nav_link "${link.label}": ${error.message}`);
    }
    console.log(`✓ footer link — ${link.label} → ${link.url}`);
  }

  console.log("\nDone. About Us, Contact, Privacy Policy and Terms of Service are live at /about-us, /contact, /privacy-policy, /terms-of-service.");
  console.log("Footer's Privacy Policy / Terms of Service / Contact Us links now point at them.");
  console.log("Edit CONTACT_EMAIL at the top of this script and re-run any time to update the address used on the Contact page.");
} catch (e) {
  console.error("\nSeed failed:", e.message);
  process.exit(1);
}
