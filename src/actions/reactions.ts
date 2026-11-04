"use server";

import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { reactToReign } from "@/services/reactions.server";
import { reactionSchema } from "@/features/reactions/schemas/reaction.schema";
import type { ActionResult, ReactionCounts, ReactionKind } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para reaccionar.";

// Maps a known react_to_reign RPC exception message to a Spanish user message.
function translateRpcError(message: string): string {
  if (message.includes("Rate limited")) return "Pará un poco: máximo 10 reacciones por minuto.";
  if (message.includes("Reign not active")) return "Ese reinado ya terminó.";
  if (message.includes("Own reign")) return "No podés reaccionar a tu propio reinado.";
  if (message.includes("Not authenticated")) return NOT_AUTH;
  return "No se pudo reaccionar. Probá de nuevo.";
}

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
    return { success: false, error: translateRpcError(errorMessage(err)) };
  }
}
