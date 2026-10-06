"use client";

import { useActionState } from "react";
import { enterAsGuest } from "@/actions/auth";

// One-click anonymous entry; the guest lands on `next` (defaults to the titles grid).
export function GuestLoginButton({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(enterAsGuest, null);

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
