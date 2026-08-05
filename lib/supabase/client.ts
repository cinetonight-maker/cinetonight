"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — used only by the admin login page (and a
 * logout button) to run `auth.signInWithPassword` / `auth.signOut`.
 * Uses the publishable key; safe to ship to the browser.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createBrowserClient(url, key);
}
