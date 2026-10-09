"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { claimSalary } from "@/services/wallet.server";
import type { ActionResult } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para cobrar.";

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
    const message = errorMessage(err);
    if (message.includes("already claimed")) {
      return { success: false, error: "Ya cobraste el sueldo de hoy. Volvé mañana." };
    }
    if (message.includes("Not authenticated")) return { success: false, error: NOT_AUTH };
    return { success: false, error: "No se pudo cobrar el sueldo. Probá de nuevo." };
  }

  // The balance chip, its salary dot and the wallet all change.
  revalidatePath("/", "layout");
  return { success: true, data: amount };
}
