"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateOwnProfile } from "@/services/profiles.server";
import type { ActionResult, Profile } from "@/types";

const usernameSchema = z.string().regex(/^[a-z0-9_]{3,20}$/, {
  error: "El username debe tener entre 3 y 20 caracteres (letras, números y guión bajo).",
});

const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "El nombre es obligatorio." })
  .max(50, { error: "El nombre no puede superar los 50 caracteres." });

// Updates username and display_name for the authenticated user (onboarding).
export async function updateProfile(
  _prevState: ActionResult<Profile> | null,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "No autenticado." };
  }

  const rawUsername = String(formData.get("username") ?? "").toLowerCase();
  const rawDisplayName = String(formData.get("display_name") ?? "");

  const usernameResult = usernameSchema.safeParse(rawUsername);
  const displayNameResult = displayNameSchema.safeParse(rawDisplayName);

  if (!usernameResult.success || !displayNameResult.success) {
    const firstError = !usernameResult.success
      ? usernameResult.error.issues[0]?.message
      : !displayNameResult.success
        ? displayNameResult.error.issues[0]?.message
        : undefined;
    return { success: false, error: firstError ?? "Datos inválidos." };
  }

  try {
    const profile = await updateOwnProfile(supabase, user.id, {
      username: usernameResult.data,
      display_name: displayNameResult.data,
    });

    revalidatePath("/");
    revalidatePath(`/@${profile.username}`);
    redirect("/");
  } catch (err: unknown) {
    // Map Postgres unique violation on username to a friendly Spanish error.
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      return {
        success: false,
        error: "Ese username ya está en uso.",
      };
    }
    return { success: false, error: "Error al actualizar el perfil." };
  }
}
