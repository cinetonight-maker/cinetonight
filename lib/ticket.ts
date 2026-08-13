import type { Movie } from "./types";
import { posterLg } from "./images";

/** Digital ticket-stub generator (components/TicketStub.tsx) — draws a
 *  shareable "movie ticket" image for any title onto a <canvas>, entirely
 *  client-side. Built for Instagram/WhatsApp-Status sharing: no backend,
 *  no tokens, nothing to configure. Colors mirror the site's CSS variables
 *  in app/globals.css so the ticket looks like it belongs to CineTonight. */

const W = 1200;
const H = 630;
const STUB_W = 380;

const COLORS = {
  bg: "#0a0a12",
  bg2: "#0e0e18",
  line: "#242433",
  txt: "#eceaf2",
  muted: "#8b8798",
  muted2: "#66647a",
  purple: "#8b5cf6",
  purple2: "#a855f7",
};

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

/** Deterministic-per-title "seat", "screen" and showtime — so re-opening
 *  the same title's ticket doesn't jump to a different seat every time,
 *  while different titles still feel varied. Pure fun, not a real booking. */
function ticketDetails(movie: Movie) {
  let h = 0;
  for (const ch of movie.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rows = "ABCDEFGHJK";
  // Unsigned shifts throughout — h can exceed 2^31 (it's kept unsigned via
  // >>> 0 above), and a signed >> on a value that large yields negative
  // numbers, which previously leaked through as "-6" screens and "-8:00"
  // showtimes.
  const seatRow = rows[h % rows.length];
  const seatNum = 1 + ((h >>> 3) % 22);
  const screen = 1 + ((h >>> 7) % 12);
  const hour = 1 + ((h >>> 11) % 10);
  const half = (h >>> 13) % 2 === 0 ? "00" : "30";
  return {
    date: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date()),
    time: `${hour}:${half} PM`,
    screen: `SCREEN ${screen}`,
    seat: `${seatRow}${seatNum}`,
  };
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
    g.addColorStop(0, COLORS.purple);
    g.addColorStop(1, "#4c1d95");
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

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.purple2;
  ctx.font = "800 20px system-ui, -apple-system, sans-serif";
  ctx.fillText("Cine", padX, 56);
  const movieW = ctx.measureText("Cine").width;
  ctx.fillStyle = "#fff";
  ctx.fillText("Tonight", padX + movieW, 56);

  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 12.5px system-ui, -apple-system, sans-serif";
  ctx.fillText("ADMIT ONE", W - 40, 30);
  ctx.font = "600 11px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.muted2;
  ctx.fillText("Know what to watch — tonight.", W - 40, 52);
  ctx.textAlign = "left";

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, 78);
  ctx.lineTo(W - 40, 78);
  ctx.stroke();

  ctx.fillStyle = COLORS.txt;
  ctx.font = "800 42px system-ui, -apple-system, sans-serif";
  const titleLines = wrapText(ctx, movie.title, padX, 140, rightW, 48, 2);

  const metaY = 140 + (titleLines - 1) * 48 + 40;
  ctx.font = "600 16px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.muted;
  const meta = [movie.year || null, movie.genres[0] || null, movie.runtime || null].filter(Boolean).join("   •   ");
  if (meta) ctx.fillText(meta, padX, metaY);

  ctx.font = "700 16px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.purple2;
  ctx.fillText(`★ ${movie.rating.toFixed(1)} / 10`, padX, metaY + 30);

  const det = ticketDetails(movie);
  const items: [string, string][] = [["DATE", det.date], ["TIME", det.time], ["SCREEN", det.screen], ["SEAT", det.seat]];
  const gridY = H - 148;
  const colW = rightW / items.length;
  items.forEach(([k, v], i) => {
    const x = padX + i * colW;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "700 11px system-ui, -apple-system, sans-serif";
    ctx.fillText(k, x, gridY);
    ctx.fillStyle = COLORS.txt;
    ctx.font = "800 19px system-ui, -apple-system, sans-serif";
    ctx.fillText(v, x, gridY + 26);
  });

  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  ctx.moveTo(padX, H - 96);
  ctx.lineTo(W - 40, H - 96);
  ctx.stroke();

  // decorative barcode (not scannable — just sets the ticket mood)
  let seed = 0;
  for (const ch of movie.id) seed = (seed * 131 + ch.charCodeAt(0)) >>> 0;
  let bx = padX;
  ctx.fillStyle = "rgba(255,255,255,.6)";
  while (bx < W - 40) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const barW = 1 + (seed % 3);
    if ((seed >>> 4) % 3 !== 0) ctx.fillRect(bx, H - 70, barW, 34);
    bx += barW + 2;
  }
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
