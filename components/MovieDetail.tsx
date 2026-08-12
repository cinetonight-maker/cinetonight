import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import PlayButton from "./PlayButton";
import TicketStub from "./TicketStub";
import BlogSection from "./BlogSection";
import CommentsSection from "./CommentsSection";
import type { Movie } from "@/lib/types";
import { personId } from "@/lib/data";
import { personTmdbId } from "@/lib/tmdb";
import { posterLg, profile, backdrop } from "@/lib/images";
import PlatformStrip from "./PlatformStrip";

// Where-to-Watch used to list five platforms side by side — five identical,
// low-contrast options split a visitor's attention and none of them stood
// out enough to click. This is affiliate space, so it works better as one
// single, unmissable, best-of-breed strip than a wall of equal choices.
const FEATURED_PLATFORM: [string, string, string] = ["Netflix", "Stream instantly in HD — no ads, no waiting", "#e50914"];

function Det({ rows }: { rows: [string, string][] }) {
  return <>{rows.map(([k, v]) => (
    <div className="det" key={k}><span className="det__k">{k}</span><span className="det__v">{v}</span></div>
  ))}</>;
}

export default function MovieDetail({ movie }: { movie: Movie }) {
  const stars = movie.cast.slice(0, 3).map((c) => c.name).join(", ") || "—";
  const isSeries = movie.kind === "series";

  const minfo: [string, string][][] = [
    [["Release Year", String(movie.year)], ["Runtime", movie.runtime], ["Language", movie.language], ["Certification", movie.cert]],
    [["Genres", movie.genres.join(", ") || "—"], ["Country", "India"], ["Director", movie.director], ["Writers", movie.writers]],
    [["Type", isSeries ? "Web Series" : "Feature Film"], ["Rating", `${movie.rating.toFixed(1)} / 10`], ["Cast", `${movie.cast.length} credited`], ["Also Known As", movie.title]],
  ];
  const about = [
    movie.desc,
    `Directed by ${movie.director}, ${movie.title} leans on a strong ensemble — ${stars} — to carry a story that balances spectacle with character.`,
    `${isSeries ? "The series" : "The film"} landed with audiences for its craft and performances, and remains one of the most talked-about ${(movie.genres[0] ?? "screen").toLowerCase()} titles of ${movie.year}.`,
  ];

  return (
    <>
      <div className="crumb">
        <Link href="/">Home</Link><span className="sep">›</span>
        <Link href={isSeries ? "/web-series" : "/movies"}>{isSeries ? "Web Series" : "Movies"}</Link><span className="sep">›</span>
        <span className="cur">{movie.title}</span>
      </div>

      <section className="dhero">
        <div className="dposter">
          <Image fill alt={`${movie.title} poster`} src={posterLg(movie)} sizes="(max-width: 900px) 40vw, 300px" priority />
        </div>
        <div>
          <h1 className="dtitle">{movie.title}</h1>
          <div className="dmeta">
            <span>{movie.year}</span><span>•</span><span>{movie.runtime}</span><span>•</span>
            {movie.genres.length > 0 && <><span>{movie.genres.join(", ")}</span><span>•</span></>}<span className="cert">{movie.cert}</span>
          </div>
          <div className="drate">
            <div className="drate__n"><Icon name="star" size={16} /> {movie.rating.toFixed(1)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="imdb-badge">IMDb</span><span className="votes">User rating</span>
            </div>
            <div className="score">User Score <div className="ring"><span>{Math.round(movie.rating * 10)}%</span></div></div>
          </div>
          <p className="dsyn">{movie.desc}</p>
          <div className="dbtns">
            {/* This site doesn't host playback — Watch Now opens the real
                trailer instead of a fake "no trailer available" sample clip,
                so the button's behavior always matches what it promises. */}
            <PlayButton movie={movie} mode="trailer" />
            <TicketStub movie={movie} />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>Where to Watch</h2></div>
        <PlatformStrip movie={movie} name={FEATURED_PLATFORM[0]} desc={FEATURED_PLATFORM[1]} color={FEATURED_PLATFORM[2]} />
        <div className="plat-note">Availability may vary by region and platform.</div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>Cast</h2></div>
        <div className="railwrap"><div className="rail castrail">
          {movie.cast.map((c) => (
            // Prefer the TMDB-id route when we have one (works for cast on
            // both local-catalogue and live-fetched titles); fall back to
            // the name-slug route, which only resolves for people who
            // appear in the local catalogue (see app/person/[id]/page.tsx).
            <Link className="castc" href={`/person/${c.tmdbId ? personTmdbId(c.tmdbId) : personId(c.name)}`} key={c.name}>
              <div className="castc__ph"><Image fill alt={c.name} src={profile(c)} sizes="64px" /></div>
              <div className="castc__n">{c.name}</div>
              <div className="castc__r">as {c.character}</div>
            </Link>
          ))}
        </div></div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>Movie Info &amp; Details</h2></div>
        <div className="minfo">{minfo.map((rows, i) => <div key={i}><Det rows={rows} /></div>)}</div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>About {movie.title}</h2></div>
        <div className="about">
          <div className="about__body">
            {about.map((p, i) => <p key={i}>{p}</p>)}
            <Link className="about__btn" href="/blog">Read More on the Blog <Icon name="chevr" size={15} /></Link>
          </div>
          <div className="about__img"><Image fill alt={`${movie.title} backdrop`} src={backdrop(movie, "w780")} sizes="(max-width: 900px) 100vw, 380px" /></div>
        </div>
      </section>

      <CommentsSection movie={movie} />

      {/* The sidebar already has a compact BlogWidget, but the sidebar is
          hidden below 1200px (see .pageaside), which left mobile visitors
          with no blog content at all on this page. */}
      <BlogSection count={3} />
    </>
  );
}
