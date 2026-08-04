import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILE = resolve(process.cwd(), "content/site.json");

/** The dashboard writes to disk, so it only runs in development. */
function guard() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The dashboard is available in development only (npm run dev)." },
      { status: 403 },
    );
  }
  return null;
}

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    return NextResponse.json(JSON.parse(await readFile(FILE, "utf8")));
  } catch (e) {
    return NextResponse.json({ error: `Could not read site.json: ${(e as Error).message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray(body.rows)) {
      return NextResponse.json({ error: "Invalid site config." }, { status: 400 });
    }
    await writeFile(FILE, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: `Could not save: ${(e as Error).message}` }, { status: 500 });
  }
}
