import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";

// Read directly (not via lib/env) so Next inlines these into the client bundle;
// lib/env's `safeParse(process.env)` only works server-side.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

// Re-bind post-guard so the string narrowing survives into createClient's closure.
const url: string = supabaseUrl;
const anonKey: string = supabaseAnonKey;

// Creates a Supabase client for browser use.
export function createClient() {
  return createBrowserClient<Database>(url, anonKey);
}
