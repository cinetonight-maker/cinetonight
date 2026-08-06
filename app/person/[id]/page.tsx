import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import { getMovies, peopleOf, getPerson, personId, creditsOf } from "@/lib/data";
import { profile } from "@/lib/images";

interface Params { params: { id: string } }

export async function generateStaticParams() {
  const movies = await getMovies();
  return peopleOf(movies).map((p) => ({ id: personId(p.name) }));
}
export const dynamicParams = true;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const movies = await getMovies();
  const p = getPerson(movies, params.id);
  return p ? { title: p.name, description: `Films and series featuring ${p.name}.` } : { title: "Not found" };
}

export default async function PersonPage({ params }: Params) {
  const movies = await getMovies();
  const p = getPerson(movies, params.id);
  if (!p) notFound();
  const credits = creditsOf(movies, p.name);
  const years = credits.map((c) => c.year);
  const avg = credits.length ? (credits.reduce((s, c) => s + c.rating, 0) / credits.length).toFixed(1) : "—";

  return (
    <div className="page">
      <div className="person">
        <div className="person__ph"><Image fill alt="" src={profile(p)} sizes="220px" priority /></div>
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
