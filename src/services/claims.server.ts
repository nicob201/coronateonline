import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Claim } from "@/types";

// Creates a pending dethrone claim via the create_claim RPC (amount re-validated server-side against the live price).
export async function createClaim(
  supabase: SupabaseServerClient,
  titleId: string,
  amount: number,
): Promise<Claim> {
  const { data, error } = await supabase.rpc("create_claim", {
    p_title_id: titleId,
    p_amount: amount,
  });

  if (error) throw error;
  return data;
}

// Fetches the authenticated user's pending claim for a title, or null if none.
export async function getPendingClaim(
  supabase: SupabaseServerClient,
  userId: string,
  titleId: string,
): Promise<Claim | null> {
  const { data, error } = await supabase
    .from("claims")
    .select("*")
    .eq("user_id", userId)
    .eq("title_id", titleId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw error;
  return data;
}
