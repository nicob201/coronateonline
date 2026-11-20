"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_INCOMPLETE_ERROR,
  RPC_ERROR,
  rpcErrorMessage,
  type RpcErrorCode,
} from "@/lib/rpc-errors";
import { dethrone } from "@/services/dethrone.server";
import { dethroneSchema } from "@/features/dethrone/schemas/dethrone.schema";
import type { ActionResult, Reign } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para destronar.";

// Spanish message for each dethrone_with_coins error code.
const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  [RPC_ERROR.AMOUNT_TOO_LOW]: "El monto no alcanza: alguien pagó más. Mirá el nuevo mínimo.",
  [RPC_ERROR.INSUFFICIENT_BALANCE]: "No te alcanzan las Coronas.",
  [RPC_ERROR.ALREADY_HOLDER]: "Ya sos el dueño de este título.",
  [RPC_ERROR.MESSAGE_TOO_LONG]: "El mensaje es demasiado largo (máx. 80 caracteres).",
  [RPC_ERROR.NOT_AUTHENTICATED]: NOT_AUTH,
  [RPC_ERROR.PROFILE_INCOMPLETE]: PROFILE_INCOMPLETE_ERROR,
  [RPC_ERROR.AMOUNT_NOT_POSITIVE]: "Monto inválido.",
};

// Spends the user's Coronas to take a title; price and balance are re-validated atomically by the RPC.
export async function destronar(
  _prevState: ActionResult<Reign> | null,
  formData: FormData,
): Promise<ActionResult<Reign>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  const parsed = dethroneSchema.safeParse({
    titleId: formData.get("titleId"),
    amount: formData.get("amount"),
    message: formData.get("message") ?? undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { titleId, amount, message } = parsed.data;

  let reign: Reign;
  try {
    reign = await dethrone(supabase, titleId, amount, message);
  } catch (err: unknown) {
    return { success: false, error: rpcErrorMessage(err, RPC_MESSAGES, "No se pudo procesar la solicitud. Probá de nuevo.") };
  }

  // Holders and balances change site-wide: header chip, cards, ticker, both wallets.
  revalidatePath("/", "layout");
  return { success: true, data: reign };
}
