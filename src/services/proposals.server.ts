import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { OwnProposal, PendingProposal, TitleProposal } from "@/types";

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

// Fetches every pending proposal, oldest first, with its author (RLS shows other authors' rows only to admins).
export async function getPendingProposals(supabase: SupabaseServerClient): Promise<PendingProposal[]> {
  const { data, error } = await supabase
    .from("title_proposals")
    .select(
      "id, name, emoji, description, created_at, author:profiles!title_proposals_user_id_fkey ( username, display_name )",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(({ author, ...proposal }) => ({
    ...proposal,
    authorUsername: author?.username ?? "",
    authorName: author?.display_name?.trim() || author?.username || "",
  }));
}

// Approves (publishes and crowns the author) or rejects (refunds) a proposal via the admin-only RPC.
export async function reviewProposal(
  supabase: SupabaseServerClient,
  proposalId: string,
  approve: boolean,
): Promise<TitleProposal> {
  const { data, error } = await supabase.rpc("review_title_proposal", {
    p_proposal_id: proposalId,
    p_approve: approve,
  });
  if (error) throw error;
  return data;
}
