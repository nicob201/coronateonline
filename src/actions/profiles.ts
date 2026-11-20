"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { displayNameSchema } from "@/features/auth/schemas/display-name.schema";
import { hasImageSignature } from "@/lib/image-signature";
import { SOCIAL_KEYS } from "@/lib/socials";
import { createClient } from "@/lib/supabase/server";
import { requireOnboardedUser } from "@/services/auth.server";
import {
  removeAvatarByUrl,
  updateOwnProfile,
  uploadAvatar,
  type ProfileUpdate,
} from "@/services/profiles.server";
import type { ActionResult, Profile } from "@/types";

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const usernameSchema = z.string().regex(/^[a-z0-9_]{3,20}$/, {
  error: "El username debe tener entre 3 y 20 caracteres (letras, números y guión bajo).",
});

const uniqueViolationSchema = z.object({ code: z.literal("23505"), message: z.string() });

// Friendly message for a Postgres unique violation on a profile write, or null for any other failure.
function profileConflictError(err: unknown): string | null {
  const conflict = uniqueViolationSchema.safeParse(err);
  if (!conflict.success) return null;
  return conflict.data.message.includes("display_name")
    ? "Ese nombre ya lo usa otra persona."
    : "Ese username ya está en uso.";
}

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

  let profile;
  try {
    profile = await updateOwnProfile(supabase, user.id, {
      username: usernameResult.data,
      display_name: displayNameResult.data,
    });
  } catch (err: unknown) {
    return { success: false, error: profileConflictError(err) ?? "Error al actualizar el perfil." };
  }

  revalidatePath("/");
  revalidatePath(`/@${profile.username}`);
  redirect("/");
}

const optionalUrl = z
  .url({ error: "Poné una URL válida (https://...)." })
  .max(300, { error: "La URL no puede superar los 300 caracteres." })
  .optional();

const detailsSchema = z.object({
  display_name: displayNameSchema,
  bio: z
    .string()
    .trim()
    .max(280, { error: "La bio no puede superar los 280 caracteres." })
    .optional(),
  instagram: optionalUrl,
  tiktok: optionalUrl,
  youtube: optionalUrl,
  x: optionalUrl,
  twitch: optionalUrl,
  website: optionalUrl,
});

// Reads a trimmed form field, returning undefined when empty.
function field(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : undefined;
}

// Updates display_name, bio, social links and (optionally) the avatar for the authenticated user.
export async function updateProfileDetails(
  _prevState: ActionResult<Profile> | null,
  formData: FormData,
): Promise<ActionResult<Profile>> {
  const { supabase, user, profile } = await requireOnboardedUser();

  const parsed = detailsSchema.safeParse({
    display_name: String(formData.get("display_name") ?? ""),
    bio: field(formData.get("bio")),
    instagram: field(formData.get("instagram")),
    tiktok: field(formData.get("tiktok")),
    youtube: field(formData.get("youtube")),
    x: field(formData.get("x")),
    twitch: field(formData.get("twitch")),
    website: field(formData.get("website")),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const avatar = formData.get("avatar");
  let uploadedUrl: string | undefined;

  if (avatar instanceof File && avatar.size > 0) {
    if (!ALLOWED_AVATAR_TYPES.has(avatar.type)) {
      return { success: false, error: "El avatar debe ser JPG, PNG, WebP o GIF." };
    }
    if (avatar.size > MAX_AVATAR_BYTES) {
      return { success: false, error: "El avatar no puede superar los 2 MB." };
    }
    if (!hasImageSignature(new Uint8Array(await avatar.slice(0, 12).arrayBuffer()))) {
      return { success: false, error: "El avatar debe ser JPG, PNG, WebP o GIF." };
    }
    try {
      uploadedUrl = await uploadAvatar(supabase, user.id, avatar);
    } catch {
      return { success: false, error: "No se pudo subir el avatar." };
    }
  }

  const updates: ProfileUpdate = {
    display_name: parsed.data.display_name,
    bio: parsed.data.bio ?? null,
  };
  for (const key of SOCIAL_KEYS) {
    updates[key] = parsed.data[key] ?? null;
  }
  if (uploadedUrl) updates.avatar_url = uploadedUrl;

  let updated: Profile;
  try {
    updated = await updateOwnProfile(supabase, user.id, updates);
  } catch (err: unknown) {
    if (uploadedUrl) await removeAvatarByUrl(supabase, uploadedUrl);
    return { success: false, error: profileConflictError(err) ?? "No se pudo guardar el perfil." };
  }

  if (uploadedUrl && profile.avatar_url && profile.avatar_url !== uploadedUrl) {
    await removeAvatarByUrl(supabase, profile.avatar_url);
  }

  revalidatePath("/perfil");
  revalidatePath(`/@${profile.username}`);
  revalidatePath("/");
  return { success: true, data: updated };
}
