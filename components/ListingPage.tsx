import Listing from "./Listing";
import BlogSection from "./BlogSection";
import { GenresWidget, TrendingWidget, NewsWidget } from "./RightRail";
import { getBrowsePage } from "@/lib/browse";
import { canonicalGenre } from "@/lib/genres";
import { toCard } from "@/lib/types";
import type { BrowseSort } from "@/lib/tmdb";

/** Now an async Server Component: it fetches the first page of results
 *  itself (via lib/browse.ts, the same helper /api/browse uses) and hands
 *  them to <Listing> as `initialData` so they're part of the real
 *  server-rendered HTML — genre/sort/page changes after that still happen
 *  client-side against /api/browse as before. Previously <Listing> fetched
 *  everything client-side on mount, so the initial HTML for /movies,
 *  /tv-shows, /web-series, /trending, /latest and every genre filter was an
 *  empty skeleton grid — invisible to a crawler that doesn't wait around
 *  for client JS to run. */
export default async function ListingPage({
  path, title, sub, kind = "all", badges, defaultSort = "trending", genre,
}: {
  /** This hub's own URL, e.g. "/movies". Currently used only for clarity at
   *  the call sites; the redirect that needs it lives in middleware.ts (see
   *  below), because that is the only place on this stack where a redirect is
   *  a real HTTP redirect. */
  path: `/${string}`;
  title: string; sub: string; kind?: "movie" | "series" | "all"; badges?: boolean;
  defaultSort?: BrowseSort; genre?: string;
}) {
  void path;

  /* ------------------------------------------------------------------------
   * ONE URL PER GENRE (Phase 4A).
   *
   * `?genre=` used to be passed straight through. TMDB's genre lookup returns
   * undefined for a name it does not recognise, so /movies?genre=anything
   * rendered the plain UNFILTERED hub — but with its own <title> and its own
   * self-referential canonical tag. Five hubs times an unlimited set of values
   * is an unbounded space of indexable duplicate pages.
   *
   * THE REDIRECT ITSELF IS IN middleware.ts, NOT HERE. This was tried here
   * first and measured in the real Cloudflare Worker: an in-render
   * `permanentRedirect()` does NOT produce a 308 on this stack. It returns
   * HTTP 200 with a client-side redirect payload — the same class of problem
   * as `notFound()` returning 200 (see docs/SEO-PHASE-4A.md for the recorded
   * status codes). A 200 that only redirects once JavaScript runs is not a
   * canonicalisation signal.
   *
   * What stays here is the SECOND line of defence: the genre value is folded
   * to its canonical form before it reaches the query, so if a request ever
   * arrives without passing through middleware, the page renders the plain
   * unfiltered hub and lib/site.ts's listingMetadata gives it the bare hub's
   * title and canonical. No duplicate is minted either way — the middleware
   * removes the URL, this makes sure it could never have been indexable.
   * --------------------------------------------------------------------- */
  const initialGenre = canonicalGenre(genre) ?? "All";
  const raw = await getBrowsePage({
    kind, sort: defaultSort, page: 1,
    genre: initialGenre === "All" ? undefined : initialGenre,
  });
  // Slim the results before they cross into <Listing> (a client component):
  // only card fields are rendered, so shipping full Movie objects sent each
  // title's cast array and half a dozen unused fields to every visitor.
  const initialData = { ...raw, results: raw.results.map(toCard) };

  return (
    <div className="page">
      <div className="page__head"><h1>{title}</h1><p>{sub}</p></div>
      <div className="pagerow">
        <div className="pagemain">
          <Listing kind={kind} badges={badges} defaultSort={defaultSort} initialGenre={initialGenre} initialData={initialData} />
        </div>
        <aside className="pageaside">
          <GenresWidget />
          <TrendingWidget />
          <NewsWidget />
        </aside>
      </div>
      <BlogSection />
    </div>
  );
}
