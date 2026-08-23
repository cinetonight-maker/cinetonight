import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import { getMovies, getPerson, creditsOf, peopleOf } from "@/lib/data";
import { profile } from "@/lib/images";
import { baseUrl } from "@/lib/site";
import { canonicalPersonId, personRedirectTarget } from "@/lib/personUrl";
import { parsePersonTmdbId, fetchPerson, searchPersonTmdb, tmdbConfigured } from "@/lib/tmdb";
import { toCard, type CastCredit, type Movie } from "@/lib/types";

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ id: string }> }

/** Metadata for a page whose record could not be resolved.
 *
 *  NOTE (unresolved): notFound() renders the 404 view but the response still
 *  carries HTTP 200 - a soft 404. Verified locally that Next's own unmatched
 *  route 404s correctly while notFound() does not, and that a loading.tsx
 *  boundary is NOT the cause. Until the status is fixed, these directives are
 *  what stop crawlers keeping and re-fetching invented ids, which matters here
 *  because the id space is unbounded (any tmdb-* number). Check the deployed
 *  Worker before assuming it is broken in production too. */
const NOT_FOUND_META = { title: "Not found", robots: { index: false, follow: false } } as const;

/* ---------------------------------------------------------------------------
 * SEO POSTURE FOR THIS ROUTE — noindex, FOLLOW. Decided in
 * docs/SEO-ARCHITECTURE-AUDIT.md and approved before this change.
 *
 * WHY noindex: person pages were 46% of the indexed sample and are the least
 * differentiated thing on the site — a name, a photo, a generated sentence and
 * a credits grid, competing with IMDb and Wikipedia on their own ground. Every
 * crawl of one is budget not spent on a blog post or a channel page.
 *
 * WHY follow, and not nofollow: the credits grid is a genuine discovery path
 * to /movie/* pages, which ARE the money pages. `follow` keeps that link value
 * flowing through the page while stopping the page itself entering the index.
 *
 * WHY NOT robots.txt Disallow: a disallowed URL is never crawled, so Google
 * never reads the noindex, and the URLs sit in the index as bare links
 * indefinitely. Crawl first, noindex second. This was an explicit instruction.
 *
 * The canonical below is SELF-referential (it points at this same person's one
 * true URL, which the redirect in the page body guarantees we are on). It is
 * deliberately not pointed at some other page: Google documents that a
 * canonical to a different URL combined with noindex can transfer the noindex
 * to the target.
 * ------------------------------------------------------------------------ */
const PERSON_ROBOTS = { index: false, follow: true } as const;


// Rendered per request, NOT persisted in the ISR cache.
//
// WHY (this route was the single biggest infrastructure cost on the site):
// the id accepts any "tmdb-p-<id>" value, so the URL space here is the whole
// of TMDB's person database (millions of entries). Every movie page links ~10
// cast members, and every person page links their whole filmography, which
// links more cast - a self-expanding graph. With ISR on, each of those URLs a
// crawler invented became a PERMANENT object in the R2 incremental cache, and
// the bucket grew to 2.79M objects / 211 GB in a fortnight, with ~1M R2 write
// operations a day.
//
// force-dynamic keeps these pages fully server-rendered (Googlebot still gets
// complete HTML, metadata and links, so indexing is unaffected) but writes
// NOTHING to R2. Repeat traffic is absorbed by the Cloudflare CDN cache
// instead, which is free. Person pages are also low-value for search next to
// title pages, so trading persistence for zero storage is the right call
// here - unlike /movie/[id], which keeps ISR precisely because it is the
// money page.
export const dynamic = "force-dynamic";

/** Local catalogue first (cast links from local titles use this), then TMDB
 *  for ids like "tmdb-p-1234" — cast members who only appear on titles
 *  fetched live from TMDB (see app/movie/[id]/page.tsx's resolve()) aren't
 *  in the local catalogue's people list, so without this branch clicking
 *  them 404'd.
 *
 *  A person found locally used to stop there — creditsOf() only ever
 *  returns titles that happen to be in this site's small curated
 *  catalogue, so most actors showed exactly one credit (whichever single
 *  title you clicked through from), not an actual filmography. Now it also
 *  pulls that person's real, live TMDB filmography (by their stored
 *  tmdbId if this cast row has one, otherwise by a name search) and merges
 *  it in — the local credit(s) first, then their other real titles. */
interface Resolved {
  person: CastCredit;
  credits: Movie[];
  /** The TMDB person id behind this page, when one is known. Drives the
   *  canonical URL — see lib/personUrl.ts. Null for a catalogue person who
   *  has no TMDB id yet, whose canonical stays the name form. */
  tmdbId: string | null;
}

async function resolvePerson(id: string, movies: Movie[]): Promise<Resolved | null> {
  const local = getPerson(movies, id);
  if (local) {
    const localCredits = creditsOf(movies, local.name);
    if (tmdbConfigured) {
      try {
        const tmdbPersonId = local.tmdbId ?? (await searchPersonTmdb(local.name));
        const remote = tmdbPersonId ? await fetchPerson(String(tmdbPersonId)) : null;
        if (remote?.credits.length) {
          const seen = new Set(localCredits.map((c) => c.id));
          const merged = [...localCredits, ...remote.credits.filter((c) => !seen.has(c.id))];
          return { person: local, credits: merged.slice(0, 20), tmdbId: tmdbPersonId != null ? String(tmdbPersonId) : null };
        }
      } catch {
        // Fall through to local-only credits — never let a live-lookup
        // hiccup break the page.
      }
    }
    return { person: local, credits: localCredits, tmdbId: local.tmdbId != null ? String(local.tmdbId) : null };
  }

  const tmdbPersonId = parsePersonTmdbId(id);
  if (!tmdbPersonId) return null;

  // Catalogue fallback BEFORE the network call, and again after it fails.
  //
  // WHY THIS IS NEW: the name form (/person/shah-rukh-khan) now permanently
  // redirects to the TMDB form, which used to be resolvable ONLY through a
  // live TMDB lookup. Without this fallback, a TMDB outage would have turned a
  // page that previously worked from the local catalogue into a 404 — the
  // redirect would have made an outage strictly worse. Now the canonical URL
  // resolves from local data whenever the person is someone we already hold.
  const fromCatalogue = peopleOf(movies).find((p) => p.tmdbId != null && String(p.tmdbId) === tmdbPersonId);

  let remote: { name: string; character: string; profilePath?: string | null; credits: Movie[] } | null = null;
  try {
    remote = await fetchPerson(tmdbPersonId);
  } catch {
    remote = null;
  }

  if (remote) {
    const localCredits = fromCatalogue ? creditsOf(movies, fromCatalogue.name) : [];
    const seen = new Set(localCredits.map((c) => c.id));
    const credits = [...localCredits, ...remote.credits.filter((c) => !seen.has(c.id))].slice(0, 20);
    return {
      person: { name: remote.name, character: remote.character, profilePath: remote.profilePath },
      credits,
      tmdbId: tmdbPersonId,
    };
  }

  if (fromCatalogue) {
    return { person: fromCatalogue, credits: creditsOf(movies, fromCatalogue.name), tmdbId: tmdbPersonId };
  }
  return null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const movies = await getMovies();
  const resolved = await resolvePerson(id, movies);
  if (!resolved) return NOT_FOUND_META;
  const canonicalId = canonicalPersonId({ tmdbId: resolved.tmdbId, name: resolved.person.name });
  return {
    title: resolved.person.name,
    description: `Films and series featuring ${resolved.person.name}.`,
    robots: PERSON_ROBOTS,
    // Self-referential: the page body redirects any non-canonical id here
    // first, so by the time this renders we ARE the canonical URL.
    alternates: { canonical: `${baseUrl()}/person/${canonicalId || id}` },
  };
}

export default async function PersonPage({ params }: Params) {
  const { id } = await params;
  const movies = await getMovies();
  const resolved = await resolvePerson(id, movies);
  if (!resolved) notFound();

  // ONE URL PER PERSON — the same rule /movie/[id] has enforced since day one.
  //
  // The id parser accepts any trailing slug, so /person/tmdb-p-35742,
  // /person/tmdb-p-35742-shah-rukh-khan and /person/tmdb-p-35742-anything all
  // resolved to the same human with a 200, and the name form was a fourth
  // address for anyone in the curated catalogue. A canonical tag alone is a
  // hint; this is the enforcement, and it consolidates whatever standing the
  // older URLs picked up. See lib/personUrl.ts for the rule itself.
  const redirectTo = personRedirectTarget(id, { tmdbId: resolved.tmdbId, name: resolved.person.name });
  if (redirectTo) permanentRedirect(redirectTo);

  const { person: p, credits } = resolved;
  const years = credits.map((c) => c.year);
  const avg = credits.length ? (credits.reduce((s, c) => s + c.rating, 0) / credits.length).toFixed(1) : "—";

  return (
    <div className="page">
      <div className="person">
        <div className="person__ph"><Image fill alt={p.name} src={profile(p)} sizes="220px" priority /></div>
        <div>
          <div className="person__n">{p.name}</div>
          <div className="person__role">Actor</div>
          <p className="person__bio">
            {p.name} appears in {credits.length} title{credits.length === 1 ? "" : "s"} on CineTonight
            {credits.length ? `, including ${credits.slice(0, 2).map((c) => c.title).join(" and ")}` : ""}.
            Known on screen for roles such as {p.character}.
          </p>
          <div className="person__facts">
            <div><b>{credits.length}</b>Titles</div>
            <div><b>{years.length ? Math.min(...years) : "—"}</b>Earliest</div>
            <div><b>{avg}</b>Avg. rating</div>
            <div><b>India</b>Based in</div>
          </div>
        </div>
      </div>
      {credits.length > 0 && (
        <Row title="Known For">
          {credits.map((m) => <MovieCard key={m.id} movie={toCard(m)} />)}
        </Row>
      )}
    </div>
  );
}
