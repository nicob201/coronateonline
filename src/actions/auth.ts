"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { displayNameSchema } from "@/features/auth/schemas/display-name.schema";
import { GUEST_ENTRY_ERROR, safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { nameGuest } from "@/services/auth.server";
import type { ActionResult } from "@/types";

// Signs out the current user and redirects to the home page.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Finishes a guest entry started in the browser: names a new guest and returns to `next`.
export async function enterAsGuest(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const displayName = displayNameSchema.safeParse(formData.get("displayName"));

  if (!user || !displayName.success) {
    return { success: false, error: GUEST_ENTRY_ERROR };
  }

  if (user.is_anonymous) {
    try {
      await nameGuest(supabase, user.id, displayName.data);
    } catch {
      return { success: false, error: GUEST_ENTRY_ERROR };
    }
  }

  // The session cookie was set in the browser, so Next can't tell the header needs a re-render.
  revalidatePath("/", "layout");
  const next = formData.get("next");
  redirect(safeNextPath(typeof next === "string" ? next : null, "/titulos"));
}
