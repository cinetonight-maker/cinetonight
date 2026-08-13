import "server-only";
import { cache } from "react";
import classicsJson from "@/content/classics.json";
import { supabasePublic } from "./supabase/public";
import { fetchTitle, findMovieTmdb, tmdbConfigured } from "./tmdb";
import { img, tmdb } from "./images";
import type { Movie } from "./types";

/* The "Free Classics" catalogue — full films this site can legally embed
   and let visitors watch on-page. Every entry is either public domain
   (copyright expired or never perfected) hosted on the Internet Archive,
   or an official rights-holder upload on YouTube.

   Managed from Dashboard → Free Movies (Supabase `classics` table — see
   supabase/classics.sql). content/classics.json is kept only as the
   offline fallback, same convention as the rest of the site's content.
   This is a hand-curated list by design: archive.org also hosts plenty of
   mislabeled pirated uploads, so nothing here is ever auto-generated — an
   editor adds an entry, verifies the source (the dashboard's Verify button
   or scripts/check-classics.mjs), and only then publishes. The public
   Supabase policy only exposes status='published' rows, so drafts never
   reach the site. */

export interface ClassicFilm {
  slug: string;
  title: string;
  year: number;
  source: { type: "archive" | "youtube"; id: string };
  /** Enables live TMDB enrichment (poster, cast, rating) when set. */
  tmdbId?: number | null;
  desc: string;
  runtime?: string;
  genre?: string;
  status: "published" | "draft";
  note?: string;
}

const FALLBACK = classicsJson as ClassicFilm[];

/* eslint-disable @typescript-eslint/no-explicit-any */
function classicFromRow(r: any): ClassicFilm {
  return {
    slug: r.slug,
    title: r.title,
    year: r.year,
    source: { type: r.source_type === "youtube" ? "youtube" : "archive", id: r.source_id },
    tmdbId: r.tmdb_id ?? null,
    desc: r.description ?? "",
    runtime: r.runtime ?? undefined,
    genre: r.genre ?? undefined,
    status: r.status === "published" ? "published" : "draft",
    note: r.note ?? undefined,
  };
}

/** Published classics, editor-defined order. The anon-key client only ever
 *  receives published rows (RLS policy), and an empty result almost always
 *  means the table hasn't been created/seeded yet — fall back to the
 *  bundled snapshot rather than rendering an empty shelf (same reasoning
 *  as getMovies()). To take a film off the site, unpublish it in the
 *  dashboard rather than deleting every row. */
export const getClassics = cache(async (): Promise<ClassicFilm[]> => {
  const sb = supabasePublic();
  if (sb) {
    const { data, error } = await sb
      .from("classics")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (!error && data && data.length > 0) return data.map(classicFromRow);
  }
  return FALLBACK.filter((c) => c.status === "published");
});

export const getClassic = async (slug: string): Promise<ClassicFilm | undefined> =>
  (await getClassics()).find((c) => c.slug === slug);

/** Embeddable player URL for a classic. Both hosts serve real iframe
 *  players: archive.org/embed/<id> and YouTube's privacy-enhanced domain. */
export function classicEmbedUrl(c: ClassicFilm): string {
  return c.source.type === "archive"
    ? `https://archive.org/embed/${encodeURIComponent(c.source.id)}`
    : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.source.id)}`;
}

/** A classic enriched with live TMDB data (poster/backdrop/rating/cast)
 *  when a tmdbId is set and TMDB is reachable; otherwise a self-contained
 *  fallback built from the curated entry. Cached per request. */
export interface EnrichedClassic {
  classic: ClassicFilm;
  /** Live TMDB details, when available. */
  movie: Movie | null;
  posterUrl: string;
  backdropUrl: string | null;
}

export const enrichClassic = cache(async (c: ClassicFilm): Promise<EnrichedClassic> => {
  let movie: Movie | null = null;
  if (tmdbConfigured) {
    try {
      // Explicit tmdbId wins; otherwise auto-resolve by title + year so
      // every film gets its REAL poster instead of a random placeholder —
      // no manual id-hunting needed when curating. Both paths are cached
      // (React request cache here + 6h fetch cache in lib/tmdb).
      movie = c.tmdbId
        ? await fetchTitle("movie", String(c.tmdbId))
        : await findMovieTmdb(c.title, c.year);
    } catch { movie = null; }
  }
  return {
    classic: c,
    movie,
    posterUrl: tmdb(movie?.posterPath, "w342") ?? img(`classic-${c.slug}`, 300, 450),
    backdropUrl: tmdb(movie?.backdropPath, "w1280"),
  };
});

export const getClassicsEnriched = cache(async (limit?: number): Promise<EnrichedClassic[]> => {
  const all = await getClassics();
  const list = limit ? all.slice(0, limit) : all;
  return Promise.all(list.map(enrichClassic));
});
