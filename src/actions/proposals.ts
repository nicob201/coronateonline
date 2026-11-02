"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { formatCoronas } from "@/lib/format";
import { TITLE_PROPOSAL_COST } from "@/lib/titles";
import { proposeTitle } from "@/services/proposals.server";
import { proposeTitleSchema } from "@/features/proposals/schemas/propose-title.schema";
import type { ActionResult, TitleProposal } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para crear un título.";

// Known propose_title RPC exceptions → Spanish messages (field limits are caught earlier by Zod).
const RPC_ERRORS: [string, string][] = [
  ["Proposal already pending", "Ya tenés una propuesta esperando revisión."],
  ["Title name taken", "Ya existe un título con ese nombre."],
  [
    "Insufficient balance",
    `No te alcanzan las Coronas: crear un título cuesta ${formatCoronas(TITLE_PROPOSAL_COST)}.`,
  ],
  ["Not authenticated", NOT_AUTH],
];

// Spends the user's Coronas to submit a title for admin review; cost and balance are checked atomically by the RPC.
export async function proponerTitulo(
  _prevState: ActionResult<TitleProposal> | null,
  formData: FormData,
): Promise<ActionResult<TitleProposal>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  const parsed = proposeTitleSchema.safeParse({
    name: formData.get("name"),
    emoji: formData.get("emoji"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { name, emoji, description } = parsed.data;
  let proposal: TitleProposal;
  try {
    proposal = await proposeTitle(supabase, name, emoji, description);
  } catch (err: unknown) {
    const message = errorMessage(err);
    const known = RPC_ERRORS.find(([key]) => message.includes(key));
    return { success: false, error: known?.[1] ?? "No se pudo enviar la propuesta. Probá de nuevo." };
  }

  // The balance chip, the wallet and the user's proposal list all change.
  revalidatePath("/", "layout");
  return { success: true, data: proposal };
}
