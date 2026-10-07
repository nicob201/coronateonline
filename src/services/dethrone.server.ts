import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Reign } from "@/types";

// Spends Coronas to take a title via the atomic dethrone_with_coins RPC; returns the new reign.
export async function dethrone(
  supabase: SupabaseServerClient,
  titleId: string,
  amount: number,
  message?: string,
): Promise<Reign> {
  const { data, error } = await supabase.rpc("dethrone_with_coins", {
    p_title_id: titleId,
    p_amount: amount,
    ...(message !== undefined ? { p_message: message } : {}),
  });

  if (error) throw error;
  return data;
}
