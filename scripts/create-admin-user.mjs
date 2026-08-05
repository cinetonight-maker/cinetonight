// One-time script: creates the single admin login user directly with the
// service-role (secret) key, bypassing public sign-up entirely (there is no
// public sign-up form anywhere on this site — this is the only way an admin
// account ever gets created).
//
// Usage:
//   node scripts/create-admin-user.mjs you@example.com "a strong password"
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocket } from "ws";

function loadEnvLocal() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of text.split("\n")) {
      // Windows-saved files use \r\n — strip the trailing \r or the regex
      // below never matches a single line and every var silently "goes
      // missing" even though the file looks correct.
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — fine if the vars are already in the environment */
  }
}
loadEnvLocal();

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: node scripts/create-admin-user.mjs you@example.com "a strong password"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (check .env.local).");
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node < 22 has no global WebSocket, and supabase-js throws at client
  // construction without one, even though this script never uses realtime.
  realtime: { transport: WebSocket },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // skip the confirmation email — this account is trusted by definition
});

if (error) {
  console.error("Could not create admin user:", error.message);
  process.exit(1);
}

console.log(`Admin user created: ${data.user.email} (id ${data.user.id})`);
console.log("You can now sign in at /admin/login with that email + password.");
