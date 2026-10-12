"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { dethrone } from "@/services/dethrone.server";
import { dethroneSchema } from "@/features/dethrone/schemas/dethrone.schema";
import type { ActionResult, Reign } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para destronar.";

// Maps a known dethrone_with_coins RPC exception message to a Spanish user message.
// ponytail: substring match on English RPC messages; upgrade to SQLSTATE codes in a migration if these strings drift.
function translateRpcError(message: string): string {
  if (message.includes("at least")) {
    return "El monto no alcanza: alguien pagó más. Mirá el nuevo mínimo.";
  }
  if (message.includes("Insufficient balance")) return "No te alcanzan las Coronas.";
  if (message.includes("already hold")) return "Ya sos el dueño de este título.";
  if (message.includes("Message too long")) {
    return "El mensaje es demasiado largo (máx. 80 caracteres).";
  }
  if (message.includes("Not authenticated")) return NOT_AUTH;
  if (message.includes("must be positive")) return "Monto inválido.";
  return "No se pudo procesar la solicitud. Probá de nuevo.";
}

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
    return { success: false, error: translateRpcError(errorMessage(err)) };
  }

  // Holders and balances change site-wide: header chip, cards, ticker, both wallets.
  revalidatePath("/", "layout");
  return { success: true, data: reign };
}
