import Link from "next/link";
import Image from "next/image";
import Icon from "./Icon";
import Stars from "./Stars";
import PlayButton from "./PlayButton";
import WatchlistButton from "./WatchlistButton";
import BlogSection from "./BlogSection";
import type { Movie } from "@/lib/types";
import { REVIEWS, personId } from "@/lib/data";
import { img, posterLg, profile, backdrop } from "@/lib/images";

const PLATFORMS: [string, string, string][] = [
  ["Disney+ Hotstar", "Subscription", "#1f80e0"], ["JioCinema", "Subscription", "#c026d3"],
  ["Prime Video", "Rent / Buy", "#00a8e1"], ["YouTube", "Rent / Buy", "#ff0000"], ["Google Play", "Rent / Buy", "#34a853"],
];

function Det({ rows }: { rows: [string, string][] }) {
  return <>{rows.map(([k, v]) => (
    <div className="det" key={k}><span className="det__k">{k}</span><span className="det__v">{v}</span></div>
  ))}</>;
}

export default function MovieDetail({ movie }: { movie: Movie }) {
  const stars = movie.cast.slice(0, 3).map((c) => c.name).join(", ") || "—";
  const isSeries = movie.kind === "series";

  const detCols: [string, string][][] = [
    [["Director", movie.director], ["Writers", movie.writers], ["Stars", stars]],
    [["Language", movie.language], ["Country", "India"], ["Type", isSeries ? "Web Series" : "Feature Film"]],
    [["Runtime", movie.runtime], ["Certification", movie.cert], ["Genres", movie.genres.join(", ") || "—"]],
  ];
  const infoCards: [string, string, string][] = [
    ["cam", "Quality", "1080p / 4K"], ["vol", "Audio", movie.language],
    ["cc", "Subtitles", `${movie.language}, English`], ["cal", "Release Year", String(movie.year)],
  ];
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
          <WatchlistButton id={movie.id} variant="save" />
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
            <PlayButton movie={movie} mode="trailer" />
            <WatchlistButton id={movie.id} />
            <PlayButton movie={movie} label="Trailer" icon="playc" className="btn btn--ghost" mode="trailer" />
          </div>
          <div className="dgrid">{detCols.map((rows, i) => <div key={i}><Det rows={rows} /></div>)}</div>
        </div>
      </section>

      <div className="infocards">
        {infoCards.map(([i, k, v]) => (
          <div className="infocard" key={k}>
            <span className="infocard__ic"><Icon name={i} size={20} /></span>
            <div><div className="infocard__k">{k}</div><div className="infocard__v">{v}</div></div>
          </div>
        ))}
      </div>

      <section className="sec">
        <div className="sec__head"><h2>Where to Watch</h2></div>
        <div className="railwrap"><div className="rail">
          {PLATFORMS.map(([n, k, c]) => (
            <div className="plat" key={n}>
              <div className="plat__logo" style={{ background: `color-mix(in srgb,${c} 20%,#15151f)`, color: c, border: `1px solid color-mix(in srgb,${c} 45%,transparent)` }}>{n[0]}</div>
              <div className="plat__name">{n}</div><div className="plat__kind">{k}</div>
              <PlayButton movie={movie} className="plat__btn" mode="trailer" />
            </div>
          ))}
        </div></div>
        <div className="plat-note">Availability may vary by region and platform.</div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>Cast</h2></div>
        <div className="railwrap"><div className="rail castrail">
          {movie.cast.map((c) => (
            <Link className="castc" href={`/person/${personId(c.name)}`} key={c.name}>
              <div className="castc__ph"><Image fill alt="" src={profile(c)} sizes="64px" /></div>
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
          <div className="about__img"><Image fill alt="" src={backdrop(movie, "w780")} sizes="(max-width: 900px) 100vw, 380px" /></div>
        </div>
      </section>

      <section className="sec">
        <div className="sec__head"><h2>User Reviews <span style={{ color: "var(--muted)", fontWeight: 500 }}>({REVIEWS.length})</span></h2></div>
        <div className="revwrap">
          <div className="revscore">
            <div className="revscore__n">{movie.rating.toFixed(1)}</div>
            <div className="revscore__stars"><Stars rating={Math.round(movie.rating / 2)} /></div>
            <div className="revscore__sub">Community rating</div>
          </div>
          <div className="revlist">
            {REVIEWS.map((r, i) => (
              <div className="rev" key={i}>
                <div className="rev__top">
                  <div className="rev__ava"><Image fill alt="" src={img(`rev-${i}`, 80, 80)} sizes="36px" /></div>
                  <div><div className="rev__name">{r.name}</div><div className="rev__stars"><Stars rating={r.rating} /></div></div>
                  <span className="rev__when">{r.when}</span>
                </div>
                <p className="rev__text">{r.text}</p>
                <div className="rev__acts">
                  <span><Icon name="thumbup" size={15} /> {r.up}</span>
                  <span><Icon name="thumbdn" size={15} /> {r.down}</span>
                  <span><Icon name="reply" size={15} /> Reply</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The sidebar already has a compact BlogWidget, but the sidebar is
          hidden below 1200px (see .pageaside), which left mobile visitors
          with no blog content at all on this page. */}
      <BlogSection count={3} />
    </>
  );
}
