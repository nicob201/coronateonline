"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_INCOMPLETE_ERROR,
  RPC_ERROR,
  rpcErrorMessage,
  type RpcErrorCode,
} from "@/lib/rpc-errors";
import { formatCoronas } from "@/lib/format";
import { TITLE_PROPOSAL_COST } from "@/lib/titles";
import { proposeTitle, reviewProposal } from "@/services/proposals.server";
import { proposeTitleSchema } from "@/features/proposals/schemas/propose-title.schema";
import { reviewProposalSchema } from "@/features/proposals/schemas/review-proposal.schema";
import type { ActionResult, TitleProposal } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para crear un título.";

// Spanish message for each propose_title error code (field limits are caught earlier by Zod).
const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  [RPC_ERROR.PROPOSAL_PENDING]: "Ya tenés una propuesta esperando revisión.",
  [RPC_ERROR.TITLE_NAME_TAKEN]: "Ya existe un título con ese nombre.",
  [RPC_ERROR.INSUFFICIENT_BALANCE]: `No te alcanzan las Coronas: crear un título cuesta ${formatCoronas(TITLE_PROPOSAL_COST)}.`,
  [RPC_ERROR.NOT_AUTHENTICATED]: NOT_AUTH,
  [RPC_ERROR.PROFILE_INCOMPLETE]: PROFILE_INCOMPLETE_ERROR,
};

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
    return {
      success: false,
      error: rpcErrorMessage(err, RPC_MESSAGES, "No se pudo enviar la propuesta. Probá de nuevo."),
    };
  }

  // The balance chip, the wallet and the user's proposal list all change.
  revalidatePath("/", "layout");
  return { success: true, data: proposal };
}

const NOT_ADMIN = "No autorizado.";

// Spanish message for each review_title_proposal error code.
const REVIEW_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  [RPC_ERROR.NOT_AUTHORIZED]: NOT_ADMIN,
  [RPC_ERROR.PROPOSAL_REVIEWED]: "Esa propuesta ya fue revisada.",
  [RPC_ERROR.TITLE_NAME_TAKEN]: "Ya existe un título con ese nombre: rechazala.",
};

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
    return {
      success: false,
      error: rpcErrorMessage(err, REVIEW_MESSAGES, "No se pudo revisar la propuesta. Probá de nuevo."),
    };
  }

  // An approval adds a title and a coronation everywhere; a rejection refunds the author's balance.
  revalidatePath("/", "layout");
  return { success: true, data: proposal };
}
