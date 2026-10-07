import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { CoinMovement } from "@/types";

// Returns the user's Coronas balance, derived in Postgres from their ledger.
export async function getBalance(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("coin_balance", { p_user_id: userId });
  if (error) throw error;
  return data;
}

// Fetches the user's most recent wallet movements, newest first.
export async function getRecentMovements(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 10,
): Promise<CoinMovement[]> {
  const { data, error } = await supabase
    .from("coin_ledger")
    .select("id, amount, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}
