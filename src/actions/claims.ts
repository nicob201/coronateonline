"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/services/auth.server";
import { applyClaim, createClaim, rejectClaim } from "@/services/claims.server";
import { dethroneSchema } from "@/features/dethrone/schemas/dethrone.schema";
import type { ActionResult, Claim } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para destronar.";

// Maps a known create_claim RPC exception message to a Spanish user message.
// ponytail: substring match on English RPC messages; upgrade to SQLSTATE codes in a migration if these strings drift.
function translateRpcError(message: string): string {
  if (message.includes("at least") || message.includes("below the current price")) {
    return "El monto no alcanza: alguien pagó más. Refrescá la página.";
  }
  if (message.includes("already hold")) {
    return "Ya sos el dueño de este título.";
  }
  if (message.includes("already have a pending claim")) {
    return "Ya tenés una solicitud pendiente para este título.";
  }
  if (message.includes("not found or already resolved")) {
    return "La solicitud ya no está pendiente.";
  }
  if (message.includes("Not authenticated")) return NOT_AUTH;
  if (message.includes("multiple of 1000") || message.includes("Minimum claim")) {
    return "Monto inválido.";
  }
  return "No se pudo procesar la solicitud. Probá de nuevo.";
}

// Creates a pending dethrone claim for the authenticated user; amount is re-validated server-side by the RPC.
export async function destronar(
  _prevState: ActionResult<Claim> | null,
  formData: FormData,
): Promise<ActionResult<Claim>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  const parsed = dethroneSchema.safeParse({
    titleId: formData.get("titleId"),
    slug: formData.get("slug"),
    amount: formData.get("amount"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }

  const { titleId, slug, amount } = parsed.data;

  let claim: Claim;
  try {
    claim = await createClaim(supabase, titleId, amount);
  } catch (err: unknown) {
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
    return { success: false, error: translateRpcError(message) };
  }

  revalidatePath(`/t/${slug}`);
  revalidatePath("/");
  return { success: true, data: claim };
}

const resolveClaimSchema = z.object({
  claimId: z.uuid(),
  slug: z.string().optional(),
  decision: z.enum(["apply", "reject"]),
});

// Admin-only: applies or rejects a pending claim, then revalidates the affected pages.
export async function resolverClaim(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const { supabase } = await requireAdmin();

  const parsed = resolveClaimSchema.safeParse({
    claimId: formData.get("claimId"),
    slug: formData.get("slug") ?? undefined,
    decision: formData.get("decision"),
  });

  if (!parsed.success) {
    return { success: false, error: "Solicitud inválida." };
  }

  const { claimId, slug, decision } = parsed.data;

  try {
    if (decision === "apply") {
      await applyClaim(supabase, claimId);
    } else {
      await rejectClaim(supabase, claimId);
    }
  } catch (err: unknown) {
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
    return { success: false, error: translateRpcError(message) };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  if (slug) revalidatePath(`/t/${slug}`);
  return { success: true, data: null };
}
