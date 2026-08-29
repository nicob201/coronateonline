import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Claim, PendingClaimListItem } from "@/types";

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

const pendingClaimsQuery = (supabase: SupabaseServerClient) =>
  supabase
    .from("claims")
    .select(
      "id, amount, created_at, profiles ( username, display_name ), titles ( name, slug )",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
type PendingClaimRow = QueryData<ReturnType<typeof pendingClaimsQuery>>[number];

// Lists every pending claim with claimant and title info, oldest first (admin only via RLS).
export async function getPendingClaims(
  supabase: SupabaseServerClient,
): Promise<PendingClaimListItem[]> {
  const { data, error } = await pendingClaimsQuery(supabase);
  if (error) throw error;

  const rows: PendingClaimRow[] = data;
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    createdAt: row.created_at,
    claimantName:
      row.profiles?.display_name?.trim() || row.profiles?.username || "Anónimo",
    titleName: row.titles?.name ?? "Título eliminado",
    titleSlug: row.titles?.slug ?? "",
  }));
}

// Applies a pending claim (atomic crown transfer); admin enforced inside the RPC.
export async function applyClaim(
  supabase: SupabaseServerClient,
  claimId: string,
): Promise<void> {
  const { error } = await supabase.rpc("apply_claim", { p_claim_id: claimId });
  if (error) throw error;
}

// Rejects a pending claim; admin enforced inside the RPC.
export async function rejectClaim(
  supabase: SupabaseServerClient,
  claimId: string,
): Promise<void> {
  const { error } = await supabase.rpc("reject_claim", { p_claim_id: claimId });
  if (error) throw error;
}
