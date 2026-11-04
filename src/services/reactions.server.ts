import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { ReactionCounts, ReactionKind } from "@/types";

// Fetches the tomato and applause totals of one reign.
export async function getReactionCounts(
  supabase: SupabaseServerClient,
  reignId: string,
): Promise<ReactionCounts> {
  const { data, error } = await supabase
    .rpc("reign_reaction_counts", { p_reign_id: reignId })
    .single();

  if (error) throw error;
  return data;
}

// Throws a reaction at an active reign via the rate-limited react_to_reign RPC; returns the new totals.
export async function reactToReign(
  supabase: SupabaseServerClient,
  reignId: string,
  kind: ReactionKind,
): Promise<ReactionCounts> {
  const { data, error } = await supabase
    .rpc("react_to_reign", { p_reign_id: reignId, p_kind: kind })
    .single();

  if (error) throw error;
  return data;
}
