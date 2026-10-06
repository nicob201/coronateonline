"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signInAsGuest } from "@/services/auth.server";
import type { ActionResult } from "@/types";

// Signs out the current user and redirects to the home page.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// Enters as an anonymous guest (reusing an existing session) and returns to `next`.
export async function enterAsGuest(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    try {
      await signInAsGuest(supabase);
    } catch {
      return {
        success: false,
        error: "No pudimos crear tu usuario invitado. Probá de nuevo en un rato.",
      };
    }
  }

  const next = formData.get("next");
  redirect(safeNextPath(typeof next === "string" ? next : null, "/titulos"));
}
