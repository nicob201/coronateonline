"use client";

import { useActionState } from "react";
import { enterAsGuest } from "@/actions/auth";
import { GUEST_ENTRY_ERROR, guestIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type { ActionResult } from "@/types";

// Signs in from the browser so Supabase's per-IP limit counts the visitor, not the server's shared IP.
async function enter(
  prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const supabase = createClient();
  const { username, displayName } = guestIdentity();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { error } = await supabase.auth.signInAnonymously({ options: { data: { username } } });
    if (error) return { success: false, error: GUEST_ENTRY_ERROR };
  }

  formData.set("displayName", displayName);
  return enterAsGuest(prevState, formData);
}

// One-click anonymous entry; the guest lands on `next` (defaults to the titles grid).
export function GuestLoginButton({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(enter, null);

  return (
    <form action={action} className="w-full flex flex-col gap-2">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full px-6 py-3 rounded-lg border border-tertiary/60 text-tertiary text-label-caps font-label-caps font-bold tracking-widest hover:bg-tertiary/10 transition-colors disabled:opacity-50"
      >
        {pending ? "PREPARANDO TU CORONA…" : "👑 ENTRAR COMO INVITADO"}
      </button>
      {state && !state.success ? (
        <p role="alert" className="text-body-sm font-body-sm text-error text-center">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
