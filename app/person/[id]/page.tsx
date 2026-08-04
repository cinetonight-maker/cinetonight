import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Row from "@/components/Row";
import MovieCard from "@/components/MovieCard";
import { PEOPLE, getPerson, personId, creditsOf } from "@/lib/data";
import { profile } from "@/lib/images";

interface Params { params: { id: string } }

export function generateStaticParams() {
  return PEOPLE.map((p) => ({ id: personId(p.name) }));
}

export function generateMetadata({ params }: Params): Metadata {
  const p = getPerson(params.id);
  return p ? { title: p.name, description: `Films and series featuring ${p.name}.` } : { title: "Not found" };
}

export default function PersonPage({ params }: Params) {
  const p = getPerson(params.id);
  if (!p) notFound();
  const credits = creditsOf(p.name);
  const years = credits.map((c) => c.year);
  const avg = credits.length ? (credits.reduce((s, c) => s + c.rating, 0) / credits.length).toFixed(1) : "—";

  return (
    <div className="page">
      <div className="person">
        <div className="person__ph">{/* eslint-disable-next-line @next/next/no-img-element */}<img alt="" src={profile(p)} /></div>
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
