"use client";

import { useState } from "react";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { LINK_RETURN_PATH } from "@/features/auth/schemas/link-result.schema";
import { createClient } from "@/lib/supabase/client";

const LINK_FAILED = "No pudimos vincular tu Google. Probá de nuevo en un rato.";
const LINK_ERRORS: Record<string, string> = {
  identity_already_exists:
    "Ese Google ya tiene una cuenta en CoronaTeOnline. Entrá con él desde el login, o vinculá otro Google.",
};

// Lets a guest keep everything by linking a Google account to the same user; `linkError` is the code a failed round trip returns.
export function SaveAccountCard({ linkError }: { linkError?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const message = failed ? LINK_FAILED : linkError ? (LINK_ERRORS[linkError] ?? LINK_FAILED) : null;

  async function link() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    const { error } = await createClient().auth.linkIdentity({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(LINK_RETURN_PATH)}`,
      },
    });
    // Without an error the browser is already on its way to Google.
    if (error) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <section className="glass-panel rounded-xl p-6 flex flex-col gap-4 border border-tertiary/40">
      <h2 className="text-label-caps font-label-caps text-tertiary">GUARDÁ TU CUENTA</h2>
      <p className="text-body-sm font-body-sm text-on-surface">
        Sos invitado: si borrás las cookies o cambiás de dispositivo, perdés tus coronas y tu saldo. Vinculá
        tu Google y seguís siendo vos, con todo lo que ganaste.
      </p>
      {message && (
        <p role="alert" className="text-body-sm font-body-sm text-error">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={link}
        disabled={pending}
        className="self-start flex items-center gap-2 px-6 py-3 rounded-lg border border-tertiary/60 text-label-caps font-label-caps font-bold tracking-widest text-tertiary hover:bg-tertiary/10 transition-colors disabled:opacity-50"
      >
        <GoogleIcon />
        {pending ? "CONECTANDO…" : "VINCULAR CON GOOGLE"}
      </button>
    </section>
  );
}
