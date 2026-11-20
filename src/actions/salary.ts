"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_INCOMPLETE_ERROR,
  RPC_ERROR,
  rpcErrorMessage,
  type RpcErrorCode,
} from "@/lib/rpc-errors";
import { claimSalary } from "@/services/wallet.server";
import type { ActionResult } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para cobrar.";

// Spanish message for each claim_salary error code.
const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  [RPC_ERROR.SALARY_CLAIMED]: "Ya cobraste el sueldo de hoy. Volvé mañana.",
  [RPC_ERROR.NOT_AUTHENTICATED]: NOT_AUTH,
  [RPC_ERROR.PROFILE_INCOMPLETE]: PROFILE_INCOMPLETE_ERROR,
};

// Claims today's salary for the signed-in user; the RPC computes the amount and allows one claim per day.
export async function cobrarSueldo(): Promise<ActionResult<number>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  let amount: number;
  try {
    amount = await claimSalary(supabase);
  } catch (err: unknown) {
    return {
      success: false,
      error: rpcErrorMessage(err, RPC_MESSAGES, "No se pudo cobrar el sueldo. Probá de nuevo."),
    };
  }

  // The balance chip, its salary dot and the wallet all change.
  revalidatePath("/", "layout");
  return { success: true, data: amount };
}
