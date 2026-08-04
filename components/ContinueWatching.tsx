"use client";

import Link from "next/link";
import Row from "./Row";
import MovieCard from "./MovieCard";
import { CONTINUE, getMovie } from "@/lib/data";

export default function ContinueWatching() {
  return (
    <Row title="Continue Watching" all={<Link className="sec__all" href="/my-list">My List</Link>}>
      {CONTINUE.map((c) => {
        const m = getMovie(c.id);
        return m ? <MovieCard key={c.id} movie={m} progress={c.progress} note={c.note} /> : null;
      })}
    </Row>
  );
}
