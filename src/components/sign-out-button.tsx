"use client";

import type { FormEvent } from "react";
import { signOut } from "@/actions/auth";

const GUEST_WARNING =
  "Sos invitado: si salís, perdés esta cuenta y tus coronas para siempre. Guardala antes desde tu perfil.\n\n¿Salir igual?";

// Header sign-out; a guest is asked first, because leaving an anonymous account loses it for good.
export function SignOutButton({ isGuest }: { isGuest: boolean }) {
  function confirmGuest(event: FormEvent<HTMLFormElement>) {
    if (isGuest && !window.confirm(GUEST_WARNING)) event.preventDefault();
  }

  return (
    <form action={signOut} onSubmit={confirmGuest} className="flex">
      <button
        type="submit"
        aria-label="Salir"
        className="p-2 md:px-4 text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
      >
        <span aria-hidden="true" className="material-symbols-outlined md:hidden!">logout</span>
        <span className="hidden md:inline">Salir</span>
      </button>
    </form>
  );
}
