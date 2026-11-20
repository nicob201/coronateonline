"use server";

import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_INCOMPLETE_ERROR,
  RPC_ERROR,
  rpcErrorMessage,
  type RpcErrorCode,
} from "@/lib/rpc-errors";
import { reactToReign } from "@/services/reactions.server";
import { reactionSchema } from "@/features/reactions/schemas/reaction.schema";
import type { ActionResult, ReactionCounts, ReactionKind } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para reaccionar.";

// Spanish message for each react_to_reign error code.
const RPC_MESSAGES: Partial<Record<RpcErrorCode, string>> = {
  [RPC_ERROR.RATE_LIMITED]: "Pará un poco: máximo 10 reacciones por minuto.",
  [RPC_ERROR.REIGN_NOT_ACTIVE]: "Ese reinado ya terminó.",
  [RPC_ERROR.OWN_REIGN]: "No podés reaccionar a tu propio reinado.",
  [RPC_ERROR.NOT_AUTHENTICATED]: NOT_AUTH,
  [RPC_ERROR.PROFILE_INCOMPLETE]: PROFILE_INCOMPLETE_ERROR,
};

// Throws a tomato or applause at a reign; the RPC checks it is active, not the caller's, and the rate limit.
export async function reaccionar(
  reignId: string,
  kind: ReactionKind,
): Promise<ActionResult<ReactionCounts>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  const parsed = reactionSchema.safeParse({ reignId, kind });
  if (!parsed.success) return { success: false, error: "Reacción inválida." };

  try {
    return { success: true, data: await reactToReign(supabase, parsed.data.reignId, parsed.data.kind) };
  } catch (err: unknown) {
    return { success: false, error: rpcErrorMessage(err, RPC_MESSAGES, "No se pudo reaccionar. Probá de nuevo.") };
  }
}
