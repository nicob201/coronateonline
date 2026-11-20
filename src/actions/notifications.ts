"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { RPC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { markNotificationsSeen } from "@/services/notifications.server";
import type { ActionResult } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para ver tus avisos.";

// Marks the signed-in user's notifications as read; the layout revalidation clears the bell's unread count.
export async function marcarNotificacionesLeidas(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  try {
    await markNotificationsSeen(supabase);
  } catch (err: unknown) {
    return {
      success: false,
      error: rpcErrorMessage(
        err,
        { [RPC_ERROR.NOT_AUTHENTICATED]: NOT_AUTH },
        "No se pudieron marcar los avisos como leídos. Probá de nuevo.",
      ),
    };
  }

  revalidatePath("/", "layout");
  return { success: true, data: null };
}
