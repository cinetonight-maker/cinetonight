import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import { getMovies, peopleOf, getPerson, personId, creditsOf } from "@/lib/data";
import { profile } from "@/lib/images";
import { parsePersonTmdbId, fetchPerson } from "@/lib/tmdb";
import type { CastCredit, Movie } from "@/lib/types";

// Next.js 15+ resolves dynamic route params asynchronously (a Promise
// instead of a plain object) — has to be awaited before use.
interface Params { params: Promise<{ id: string }> }

export async function generateStaticParams() {
  const movies = await getMovies();
  return peopleOf(movies).map((p) => ({ id: personId(p.name) }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

/** Local catalogue first (cast links from local titles use this), then TMDB
 *  for ids like "tmdb-p-1234" — cast members who only appear on titles
 *  fetched live from TMDB (see app/movie/[id]/page.tsx's resolve()) aren't
 *  in the local catalogue's people list, so without this branch clicking
 *  them 404'd. */
async function resolvePerson(id: string, movies: Movie[]): Promise<{ person: CastCredit; credits: Movie[] } | null> {
  const local = getPerson(movies, id);
  if (local) return { person: local, credits: creditsOf(movies, local.name) };

  const tmdbPersonId = parsePersonTmdbId(id);
  if (!tmdbPersonId) return null;
  const remote = await fetchPerson(tmdbPersonId);
  if (!remote) return null;
  return {
    person: { name: remote.name, character: remote.character, profilePath: remote.profilePath },
    credits: remote.credits,
  };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const movies = await getMovies();
  const resolved = await resolvePerson(id, movies);
  return resolved
    ? { title: resolved.person.name, description: `Films and series featuring ${resolved.person.name}.` }
    : { title: "Not found" };
}

export default async function PersonPage({ params }: Params) {
  const { id } = await params;
  const movies = await getMovies();
  const resolved = await resolvePerson(id, movies);
  if (!resolved) notFound();
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
            {p.name} appears in {credits.length} title{credits.length === 1 ? "" : "s"} in the MOVIEX catalogue
            {credits.length ? `, including ${credits.slice(0, 2).map((c) => c.title).join(" and ")}` : ""}.
            Known on screen for roles such as {p.character}.
          </p>
          <div className="person__facts">
            <div><b>{credits.length}</b>Titles here</div>
            <div><b>{years.length ? Math.min(...years) : "—"}</b>Earliest</div>
            <div><b>{avg}</b>Avg. rating</div>
            <div><b>India</b>Based in</div>
          </div>
        </div>
      </div>
      {credits.length > 0 && (
        <Row title="Known For">
          {credits.map((m) => <MovieCard key={m.id} movie={m} />)}
        </Row>
      )}
    </div>
  );
}
