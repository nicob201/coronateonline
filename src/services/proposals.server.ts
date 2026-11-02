import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { OwnProposal, TitleProposal } from "@/types";

// Submits a title for review via the atomic propose_title RPC, which charges its cost.
export async function proposeTitle(
  supabase: SupabaseServerClient,
  name: string,
  emoji: string,
  description: string,
): Promise<TitleProposal> {
  const { data, error } = await supabase.rpc("propose_title", {
    p_name: name,
    p_emoji: emoji,
    p_description: description,
  });
  if (error) throw error;
  return data;
}

// Fetches the user's latest title proposals, newest first, with the published slug once approved.
export async function getOwnProposals(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<OwnProposal[]> {
  const { data, error } = await supabase
    .from("title_proposals")
    .select("id, name, emoji, status, created_at, titles ( slug )")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return data.map(({ titles, ...proposal }) => ({ ...proposal, titleSlug: titles?.slug ?? null }));
}
