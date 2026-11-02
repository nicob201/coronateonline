"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { formatCoronas } from "@/lib/format";
import { TITLE_PROPOSAL_COST } from "@/lib/titles";
import { proposeTitle, reviewProposal } from "@/services/proposals.server";
import { proposeTitleSchema } from "@/features/proposals/schemas/propose-title.schema";
import { reviewProposalSchema } from "@/features/proposals/schemas/review-proposal.schema";
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

const NOT_ADMIN = "No autorizado.";

// Known review_title_proposal RPC exceptions → Spanish messages for the admin.
const REVIEW_ERRORS: [string, string][] = [
  ["Not authorized", NOT_ADMIN],
  ["Proposal already reviewed", "Esa propuesta ya fue revisada."],
  ["Title name taken", "Ya existe un título con ese nombre: rechazala."],
];

// Approves or rejects a title proposal; the RPC checks profiles.is_admin in the database.
export async function revisarPropuesta(
  _prevState: ActionResult<TitleProposal> | null,
  formData: FormData,
): Promise<ActionResult<TitleProposal>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_ADMIN };

  const parsed = reviewProposalSchema.safeParse({
    proposalId: formData.get("proposalId"),
    decision: formData.get("decision"),
  });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };

  let proposal: TitleProposal;
  try {
    proposal = await reviewProposal(supabase, parsed.data.proposalId, parsed.data.decision === "approve");
  } catch (err: unknown) {
    const message = errorMessage(err);
    const known = REVIEW_ERRORS.find(([key]) => message.includes(key));
    return { success: false, error: known?.[1] ?? "No se pudo revisar la propuesta. Probá de nuevo." };
  }

  // An approval adds a title and a coronation everywhere; a rejection refunds the author's balance.
  revalidatePath("/", "layout");
  return { success: true, data: proposal };
}
