/**
 * CineTonight catalogue seed — the list of titles the site carries.
 * `npm run sync` looks each of these up on TMDB and regenerates lib/data.ts.
 *
 * To add a title: add a line here (title + year + kind), then re-run the sync.
 * `tmdbId` is optional — set it if the search picks the wrong match.
 */
export const CATALOGUE = [
  // ---- films ----
  { title: "Stree 2", year: 2024, kind: "movie" },
  { title: "Pushpa 2: The Rule", year: 2024, kind: "movie" },
  { title: "Kalki 2898 AD", year: 2024, kind: "movie" },
  { title: "Fighter", year: 2024, kind: "movie" },
  { title: "Salaar: Part 1 – Ceasefire", year: 2023, kind: "movie" },
  { title: "Animal", year: 2023, kind: "movie" },
  { title: "Jawan", year: 2023, kind: "movie" },
  { title: "Pathaan", year: 2023, kind: "movie" },
  { title: "12th Fail", year: 2023, kind: "movie" },
  { title: "Laapataa Ladies", year: 2024, kind: "movie" },
  { title: "RRR", year: 2022, kind: "movie" },
  { title: "3 Idiots", year: 2009, kind: "movie" },
  // ---- series ----
  { title: "Mirzapur", year: 2018, kind: "series" },
  { title: "The Family Man", year: 2019, kind: "series" },
  { title: "Panchayat", year: 2020, kind: "series" },
  { title: "Farzi", year: 2023, kind: "series" },
  { title: "Scam 1992: The Harshad Mehta Story", year: 2020, kind: "series" },
  { title: "Kota Factory", year: 2019, kind: "series" },
];

/** Curated home-page rows, referenced by slug (derived from the title above). */
export const ROW_SEED = {
  latest: ["kalki-2898-ad", "stree-2", "laapataa-ladies", "fighter", "pushpa-2-the-rule", "animal"],
  trending: ["stree-2", "pushpa-2-the-rule", "kalki-2898-ad", "jawan", "12th-fail", "rrr"],
  web: ["panchayat", "mirzapur", "the-family-man", "farzi", "scam-1992-the-harshad-mehta-story", "kota-factory"],
  top: ["scam-1992-the-harshad-mehta-story", "panchayat", "12th-fail", "the-family-man", "kota-factory", "3-idiots"],
};

/** Illustrative "continue watching" progress (not from TMDB). */
export const CONTINUE_SEED = [
  { id: "mirzapur", progress: 62, note: "S3 E5 · 45m left" },
  { id: "panchayat", progress: 80, note: "S3 E6 · 10m left" },
  { id: "fighter", progress: 25, note: "1h 40m left" },
  { id: "farzi", progress: 48, note: "S1 E3 · 20m left" },
  { id: "kalki-2898-ad", progress: 55, note: "1h 15m left" },
  { id: "jawan", progress: 35, note: "50m left" },
];

export const slugify = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
