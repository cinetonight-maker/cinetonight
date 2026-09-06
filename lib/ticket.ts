import type { Movie } from "./types";
import { posterLg } from "./images";
import { baseUrl } from "./site";
import { displayRating, validYear } from "./quality";
import QRCode from "qrcode";

/** Digital ticket-stub generator (components/TicketStub.tsx) — draws a
 *  shareable "movie ticket" image for any title onto a <canvas>, entirely
 *  client-side. Built for Instagram/WhatsApp-Status sharing: no backend,
 *  no tokens, nothing to configure. Colors are a hand-kept mirror of the site's CSS variables (app/globals.css /
 *  app/v2-theme.css) so the ticket looks like it belongs to CineTonight --
 *  <canvas> fillStyle can't read CSS custom properties, so these must be
 *  updated by hand whenever the theme palette changes.
 *
 *  EVERYTHING ON THIS TICKET IS REAL. Earlier versions filled the details
 *  grid with a deterministic-but-fake seat/screen/showtime (a fun idea, but
 *  it invented facts that don't exist - no real cinema, no real seat). That
 *  grid now shows the title's own Genre/Runtime/Year/Rating - data this
 *  component is already handed - and the rating is explicitly captioned as
 *  TMDB's, not CineTonight's, matching the honesty rule applied everywhere
 *  else on the site (lib/quality.ts displayRating / hasVerdict etc). The
 *  bottom barcode used to be pure decoration ("not scannable"); it's now a
 *  REAL QR code encoding this title's own canonical movie URL, so a shared
 *  ticket actually leads somewhere instead of just looking like a ticket. */

const W = 1200;
const H = 630;
const STUB_W = 380;

const COLORS = {
  bg: "#06080b",
  bg2: "#0a0d12",
  line: "#262c34",
  txt: "#f2efe9",
  muted: "#9a9ea5",
  muted2: "#6b6f76",
  accent: "#e2182b",
  accent2: "#ff3b48",
  accentD: "#8f1220",
  gold: "#ffcf4d",
};

/** BrandMark, redrawn on <canvas> (SVG <path>/CSS-var fills can't be used
 *  directly here). Path data + colors copied from components/BrandMark.tsx
 *  ("Master copy also lives at public/logo.svg" per that file's own
 *  comment - but public/logo.svg is stale, still the pre-rebrand purple, so
 *  BrandMark.tsx's own paths/colors are the actual current mark to match). */
const BRAND_MARK = {
  viewBox: 100,
  back: { d: "M52 36 L52 64 L76 50 Z", fill: COLORS.accentD },
  front: { d: "M40 34 L40 66 L68 50 Z", fill: COLORS.accent2 },
  sparkle: { d: "M36 8 Q38.6 21.4 52 24 Q38.6 26.6 36 40 Q33.4 26.6 20 24 Q33.4 21.4 36 8 Z", fill: "#f4f2fa" },
};

function drawBrandMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / BRAND_MARK.viewBox;
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  for (const part of [BRAND_MARK.back, BRAND_MARK.front]) {
    const p = new Path2D(part.d);
    ctx.fillStyle = part.fill;
    ctx.strokeStyle = part.fill;
    ctx.lineWidth = 16;
    ctx.stroke(p);
    ctx.fill(p);
  }
  ctx.fillStyle = BRAND_MARK.sparkle.fill;
  ctx.fill(new Path2D(BRAND_MARK.sparkle.d));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws `img` into the target rect, cropping (not squashing) to cover it —
 *  same behavior as CSS `object-fit: cover`. */
function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, dx: number, dy: number, dw: number, dh: number) {
  const ir = img.width / img.height;
  const dr = dw / dh;
  let sx: number, sy: number, sw: number, sh: number;
  if (ir > dr) { sh = img.height; sw = sh * dr; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / dr; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Wraps `text` to `maxWidth`, drawing up to `maxLines` and ellipsizing the
 *  last line if it doesn't all fit. Returns the number of lines drawn (so
 *  the caller can lay out whatever comes next). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): number {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  let truncated = false;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) { truncated = true; break; }
    } else {
      line = test;
    }
  }
  if (!truncated && line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; truncated = true; }

  if (truncated && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}…`;
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
  return lines.length;
}

/** Draws a real, scannable QR code into the given box using qrcode's
 *  low-level `create()` (synchronous - just a module matrix, no rendering),
 *  so we can draw it ourselves in exactly this spot with our own margins
 *  instead of letting the library render/replace the whole canvas.
 *  White background + true black modules, not theme colors: scan
 *  reliability matters more here than palette-matching, and a light card
 *  behind it already reads as "the QR part" against the dark ticket. */
function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, box: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const quiet = box * 0.09; // quiet zone inside the white card, for real-world scan reliability
  const inner = box - quiet * 2;
  const cell = inner / size;

  ctx.fillStyle = "#fff";
  roundRect(ctx, x, y, box, box, 8);
  ctx.fill();

  ctx.fillStyle = "#0a0a0a";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) {
        ctx.fillRect(x + quiet + col * cell, y + quiet + row * cell, cell + 0.5, cell + 0.5);
      }
    }
  }
}

export interface DrawTicketOptions {
  /** Try to embed the title's poster art. If it fails to load, or the
   *  canvas can't later be read back out (a tainted cross-origin image),
   *  the caller should redraw with this set to false. */
  includePoster: boolean;
}

/** Draws the full ticket onto `canvas` (resizing it to the ticket's native
 *  1200×630 pixel size). Async because it may need to load the poster
 *  image first. */
export async function drawTicket(canvas: HTMLCanvasElement, movie: Movie, opts: DrawTicketOptions): Promise<void> {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingQuality = "high";

  // This title's OWN canonical URL - same `${baseUrl()}/movie/${id}` formula
  // used for the page's <link rel="canonical"> and JSON-LD (app/movie/[id]/
  // page.tsx) - never a fabricated or homepage link. This is what the QR
  // code below encodes.
  const canonicalUrl = `${baseUrl()}/movie/${movie.id}`;

  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, COLORS.bg2);
  bgGrad.addColorStop(1, COLORS.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.clip();

  // ---- left stub: poster art (or a gradient fallback) ----
  const posterImg = opts.includePoster ? await loadImage(posterLg(movie)) : null;
  if (posterImg) {
    drawCover(ctx, posterImg, 0, 0, STUB_W, H);
    const shade = ctx.createLinearGradient(0, H * 0.35, 0, H);
    shade.addColorStop(0, "rgba(10,10,18,0)");
    shade.addColorStop(1, "rgba(10,10,18,.88)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, STUB_W, H);
  } else {
    const g = ctx.createLinearGradient(0, 0, STUB_W, H);
    g.addColorStop(0, COLORS.accentD);
    g.addColorStop(1, "#22050a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STUB_W, H);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.font = "700 150px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎬", STUB_W / 2, H / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  ctx.save();
  ctx.translate(30, H - 26);
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.font = "700 15px system-ui, -apple-system, sans-serif";
  ctx.fillText(movie.title.slice(0, 30).toUpperCase(), 0, 0);
  ctx.restore();

  // perforation between the stub and the ticket body
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(STUB_W, 0);
  ctx.lineTo(STUB_W, H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.bg;
  ctx.beginPath(); ctx.arc(STUB_W, 0, 16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(STUB_W, H, 16, 0, Math.PI * 2); ctx.fill();

  ctx.restore(); // end outer clip

  // ---- right side: ticket details ----
  const padX = STUB_W + 44;
  const rightW = W - padX - 40;

  // Real BrandMark + wordmark (Header.tsx / Footer.tsx convention: mark,
  // then "Cine" + bold "Tonight" in the accent color) - replaces the old
  // hand-drawn-text-only version.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  drawBrandMark(ctx, padX, 20, 34);
  const wordmarkX = padX + 34 + 10;
  ctx.fillStyle = COLORS.accent2;
  ctx.font = "800 20px system-ui, -apple-system, sans-serif";
  ctx.fillText("Cine", wordmarkX, 46);
  const movieW = ctx.measureText("Cine").width;
  ctx.fillStyle = "#fff";
  ctx.fillText("Tonight", wordmarkX + movieW, 46);

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 12.5px system-ui, -apple-system, sans-serif";
  ctx.fillText("ADMIT ONE", W - 40, 30);
  ctx.font = "600 11px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.muted2;
  ctx.fillText("Know what to watch - tonight.", W - 40, 52);
  ctx.textAlign = "left";

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, 78);
  ctx.lineTo(W - 40, 78);
  ctx.stroke();

  // Title gets the top of the card to itself - clean and premium rather
  // than crowded, per the "don't overcrowd it" brief.
  ctx.fillStyle = COLORS.txt;
  ctx.font = "800 44px system-ui, -apple-system, sans-serif";
  wrapText(ctx, movie.title, padX, 168, rightW, 50, 2);

  // ---- REAL details grid: Genre / Runtime / Year / Rating ----
  // Only real, already-available data - no invented seat/screen/showtime.
  // Columns that have nothing real to show simply don't render (the grid
  // stays honest rather than padded with placeholders). Fixed position
  // right under the title (not pinned to the bottom) - the QR below needs
  // most of the card's remaining height to be genuinely scannable.
  const rating = displayRating(movie);
  const items: [string, string][] = [
    movie.genres[0] ? ["GENRE", movie.genres[0]] : null,
    movie.runtime ? ["RUNTIME", movie.runtime] : null,
    validYear(movie.year) ? ["YEAR", String(movie.year)] : null,
    rating ? ["RATING", `★ ${rating}`] : null,
  ].filter((x): x is [string, string] => x !== null);

  const gridY = 258;
  if (items.length) {
    const colW = rightW / items.length;
    items.forEach(([k, v], i) => {
      const x = padX + i * colW;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "700 11px system-ui, -apple-system, sans-serif";
      ctx.fillText(k, x, gridY);
      ctx.fillStyle = k === "RATING" ? COLORS.gold : COLORS.txt;
      ctx.font = "800 19px system-ui, -apple-system, sans-serif";
      ctx.fillText(v, x, gridY + 26);
    });
    // Honesty caption - only drawn when a rating is actually shown, so it
    // never appears as clutter on a title with no rating to caveat.
    if (rating) {
      ctx.fillStyle = COLORS.muted2;
      ctx.font = "600 9.5px system-ui, -apple-system, sans-serif";
      ctx.fillText("Rating shown is TMDB's - not a CineTonight score.", padX, gridY + 42);
    }
  }

  const dividerY = gridY + 68;
  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(padX, dividerY);
  ctx.lineTo(W - 40, dividerY);
  ctx.stroke();

  // ---- bottom band: real QR (this title's canonical URL) + site URL ----
  // Sized to actually be scannable in the exported PNG (a 72px box at 1200px
  // canvas width was reported unscannable) - 172px is comparable to a real
  // boarding-pass/ticket QR at typical viewing distance. This band now owns
  // all the remaining card height below the divider, rather than being
  // squeezed into a thin strip.
  const qrBox = 172;
  const bandTop = dividerY;
  const bandBottom = H - 40;
  const qrX = W - 40 - qrBox;
  const qrY = bandTop + (bandBottom - bandTop - qrBox) / 2;
  drawQr(ctx, canonicalUrl, qrX, qrY, qrBox);

  const bandMidY = bandTop + (bandBottom - bandTop) / 2;
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 11px system-ui, -apple-system, sans-serif";
  ctx.fillText("SCAN TO WATCH TONIGHT", padX, bandMidY - 20);
  ctx.fillStyle = COLORS.accent2;
  ctx.font = "800 26px system-ui, -apple-system, sans-serif";
  ctx.fillText("cinetonight.com", padX, bandMidY + 14);
  ctx.fillStyle = COLORS.muted2;
  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("Point your camera at the code", padX, bandMidY + 38);
}

/** Wraps `canvas.toBlob` in a Promise, rejecting instead of resolving with
 *  `null` — so a tainted (cross-origin, no CORS) canvas surfaces as a
 *  catchable error the caller can recover from. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))), "image/png");
    } catch (e) {
      reject(e);
    }
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
