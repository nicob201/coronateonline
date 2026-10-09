import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { CoinMovement, SalaryStatus } from "@/types";

// Returns the user's Coronas balance, derived in Postgres from their ledger.
export async function getBalance(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("coin_balance", { p_user_id: userId });
  if (error) throw error;
  return data;
}

// Returns the signed-in user's daily salary state, derived in Postgres from their ledger.
export async function getSalaryStatus(supabase: SupabaseServerClient): Promise<SalaryStatus> {
  const { data, error } = await supabase.rpc("salary_status").single();
  if (error) throw error;
  return data;
}

// Credits the signed-in user's salary for today; returns the amount credited.
export async function claimSalary(supabase: SupabaseServerClient): Promise<number> {
  const { data, error } = await supabase.rpc("claim_salary");
  if (error) throw error;
  return data;
}

const movementsQuery = (supabase: SupabaseServerClient, userId: string, limit: number) =>
  supabase
    .from("coin_ledger")
    .select(
      `id, amount, reason, created_at,
       reigns ( titles ( name ),
         holder:profiles!reigns_user_id_fkey ( username, display_name ),
         dethroned:profiles!reigns_dethroned_user_id_fkey ( username, display_name ) )`,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
type MovementRow = QueryData<ReturnType<typeof movementsQuery>>[number];
type PersonRow = { username: string; display_name: string | null } | null;

function personName(person: PersonRow): string | null {
  return person ? (person.display_name ?? person.username) : null;
}

// Flattens a joined ledger row: the counterpart is who you dethroned, or who dethroned you.
function toMovement(row: MovementRow): CoinMovement {
  const reign = row.reigns;
  return {
    id: row.id,
    amount: row.amount,
    reason: row.reason,
    created_at: row.created_at,
    titleName: reign?.titles?.name ?? null,
    counterpartName:
      row.reason === "dethroned" ? personName(reign?.holder ?? null) : personName(reign?.dethroned ?? null),
  };
}

// Fetches the user's most recent wallet movements, newest first, with title and counterpart.
export async function getRecentMovements(
  supabase: SupabaseServerClient,
  userId: string,
  limit = 10,
): Promise<CoinMovement[]> {
  const { data, error } = await movementsQuery(supabase, userId, limit);
  if (error) throw error;
  return data.map(toMovement);
}
