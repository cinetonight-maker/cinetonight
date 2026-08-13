-- Starter content for CineTonight's Pages + footer Nav — run this ONCE in the
-- Supabase SQL Editor (safe to re-run: guarded with ON CONFLICT / WHERE NOT
-- EXISTS, so re-running never creates duplicates).
--
-- Everything below is inserted as a DRAFT (pages.status = 'draft'), so
-- NOTHING goes live on the public site until you open it in the dashboard's
-- Pages tab, read it, customize the bracketed [placeholders], and hit
-- Publish. The Privacy Policy / Terms / DMCA pages are generic templates,
-- not legal advice — have them reviewed before you rely on them, especially
-- if you serve users in a regulated region (EU/UK, California, etc.).
--
-- The footer Nav links below point to /p/<slug> for each page. Because the
-- pages start as drafts, those footer links will 404 until you publish the
-- matching page — publish first, or delete/hide the nav link until you do.

insert into pages (slug, title, content, status)
values (
  'about',
  'About Us',
  $page$> **Draft — review and edit before publishing.**

# About CineTonight

CineTonight is a movie and TV companion site: browse posters, ratings, cast and crew details, and trailers for thousands of titles, all in one place.

## What CineTonight is

- A discovery and information hub for movies and web series — genres, ratings, cast, and what's trending right now.
- Metadata (posters, descriptions, cast, ratings) is sourced from [The Movie Database (TMDB)](https://www.themoviedb.org/) and displayed under their terms of use. CineTonight is not endorsed or certified by TMDB.
- Trailers are embedded directly from YouTube.

## What CineTonight is not

CineTonight does not host, store, or distribute copyrighted film or television content. See our [DMCA & Copyright](/p/dmca) page for details.

## Questions

Reach out any time — see our [Contact](/p/contact) page.

---
*[Replace this paragraph with a short note about who built CineTonight and why — a founder's note, a portfolio project description, or a company overview, whichever applies.]*
$page$,
  'draft'
)
on conflict (slug) do nothing;

insert into pages (slug, title, content, status)
values (
  'contact',
  'Contact',
  $page$> **Draft — review and edit before publishing.**

# Contact Us

We would love to hear from you — questions, feedback, partnership inquiries, or a copyright concern.

**Email:** the address configured in the dashboard's Settings tab (Contact Email) is shown automatically in the footer's "Contact Us" link. Make sure it is set to an inbox you actually monitor.

For copyright takedown requests specifically, see our [DMCA & Copyright](/p/dmca) page instead — it lists exactly what we need to process a request quickly.

*[Optional: add a physical mailing address, response-time expectations, or a contact form here.]*
$page$,
  'draft'
)
on conflict (slug) do nothing;

insert into pages (slug, title, content, status)
values (
  'privacy-policy',
  'Privacy Policy',
  $page$> **Draft — have this reviewed before publishing. This is a generic template, not legal advice, and may not satisfy GDPR/CCPA or other regional requirements that apply to your userbase.**

# Privacy Policy

_Last updated: [date]_

This Privacy Policy explains what information CineTonight ("we", "us") collects when you use this site, and how it is used.

## Information we collect

- **Usage data** — pages viewed, general analytics, and technical data like browser type and IP address, collected automatically.
- **Account information** — if you create an account, we store the email address and any profile details you provide.
- **Comments** — if you submit a comment on a title, we store the name and text you provide. Comments are reviewed before appearing publicly.

## How we use it

To operate and improve the site, moderate submitted content, and respond to inquiries. We do not sell personal information.

## Third parties

This site displays data from [TMDB](https://www.themoviedb.org/) and embeds videos from YouTube; both may set their own cookies or collect data per their own privacy policies when you interact with their embedded content.

## Your choices

[Describe any account deletion, data export, or opt-out process you actually offer.]

## Contact

Questions about this policy: see our [Contact](/p/contact) page.

---
*[Replace the bracketed sections above with your actual practices. If you serve users in the EU/UK, California, or other regulated regions, have this reviewed by someone qualified before publishing.]*
$page$,
  'draft'
)
on conflict (slug) do nothing;

insert into pages (slug, title, content, status)
values (
  'terms',
  'Terms of Service',
  $page$> **Draft — have this reviewed before publishing. This is a generic template, not legal advice.**

# Terms of Service

_Last updated: [date]_

By using CineTonight, you agree to these terms.

## Use of the site

CineTonight provides movie and TV information, ratings, and trailers for personal, non-commercial use. Do not scrape, resell, or misuse the content or the service.

## Accounts

If you create an account, you are responsible for keeping your credentials secure and for activity under your account.

## User submissions

Comments and ratings you submit must be your own, must not infringe anyone's rights, and must not be unlawful, harassing, or spam. We may remove any submission at our discretion.

## Third-party content

Movie/TV metadata is sourced from TMDB; trailers are embedded from YouTube. We do not control and are not responsible for third-party content or availability.

## Disclaimer

The site is provided "as is" without warranties of any kind. [Add liability limitations appropriate to your jurisdiction.]

## Changes

We may update these terms; continued use after a change means you accept the updated terms.

## Contact

See our [Contact](/p/contact) page.

---
*[Have a lawyer review this before treating it as binding — especially the disclaimer/liability section, which varies a lot by jurisdiction.]*
$page$,
  'draft'
)
on conflict (slug) do nothing;

insert into pages (slug, title, content, status)
values (
  'dmca',
  'DMCA & Copyright',
  $page$> **Draft — have this reviewed before publishing. This is a generic template, not legal advice.**

# DMCA & Copyright Notice

CineTonight does not host, store, or stream copyrighted film or television content. The site displays:

- Movie/TV metadata (titles, posters, descriptions, cast) sourced from [TMDB](https://www.themoviedb.org/) under their terms of use.
- Trailers embedded directly from YouTube, played through YouTube's own embedded player.

If you believe content on this site infringes your copyright, contact us with:

1. Identification of the copyrighted work you claim is infringed.
2. The URL(s) on this site where the material appears.
3. Your contact information (name, email, address).
4. A statement that you have a good-faith belief the use is not authorized.
5. A statement, under penalty of perjury, that the above information is accurate and that you are the copyright owner or authorized to act on their behalf.

Send takedown requests to the email on our [Contact](/p/contact) page.

---
*[If you operate in the US and want formal DMCA safe-harbor protection, you may need to register a designated agent with the U.S. Copyright Office at https://www.copyright.gov/dmca-directory/ — a lawyer can advise whether that applies to your setup.]*
$page$,
  'draft'
)
on conflict (slug) do nothing;

-- Footer nav links pointing at the pages above. nav_links has no unique
-- constraint, so dedupe manually with WHERE NOT EXISTS instead of ON CONFLICT.
insert into nav_links (location, label, url, sort_order, is_external)
select 'footer_support', 'About', '/p/about', 100, false
where not exists (select 1 from nav_links where location = 'footer_support' and url = '/p/about');

insert into nav_links (location, label, url, sort_order, is_external)
select 'footer_support', 'Contact', '/p/contact', 101, false
where not exists (select 1 from nav_links where location = 'footer_support' and url = '/p/contact');

insert into nav_links (location, label, url, sort_order, is_external)
select 'footer_legal', 'Privacy Policy', '/p/privacy-policy', 100, false
where not exists (select 1 from nav_links where location = 'footer_legal' and url = '/p/privacy-policy');

insert into nav_links (location, label, url, sort_order, is_external)
select 'footer_legal', 'Terms of Service', '/p/terms', 101, false
where not exists (select 1 from nav_links where location = 'footer_legal' and url = '/p/terms');

insert into nav_links (location, label, url, sort_order, is_external)
select 'footer_legal', 'DMCA', '/p/dmca', 102, false
where not exists (select 1 from nav_links where location = 'footer_legal' and url = '/p/dmca');
