"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { GoogleIcon } from "@/features/auth/components/google-icon";
import { GuestLoginButton } from "@/features/auth/components/guest-login-button";

type FormState = "idle" | "loading" | "success" | "error";

// Login card: one-click guest entry on top, then magic link and Google.
export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setState("loading");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
      setPending(false);
      return;
    }

    setState("success");
    setPending(false);
  }

  async function handleGoogle() {
    if (pending) return;
    setPending(true);
    setState("loading");
    setErrorMsg("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setState("error");
      setErrorMsg(error.message);
    }
  }

  return (
    <div className="glass-panel rounded-2xl p-8 w-full max-w-md">
      <h1 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface mb-2 uppercase tracking-tighter text-center">
        <span className="text-gradient-primary">Ingresar</span>
      </h1>
      <p className="text-body-sm font-body-sm text-on-surface-variant mb-8 text-center">
        Elegí tu título. Coronate. Hacete conocido.
      </p>

      {state === "success" ? (
        <div className="glass-panel rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-primary mb-3">
            mail
          </span>
          <p className="text-body-lg font-body-lg text-on-surface font-bold mb-2">
            Revisá tu email
          </p>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Te enviamos un link para ingresar. Abrí el link desde este mismo navegador.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 mb-6">
            <GuestLoginButton next={next} />
            <p className="text-body-sm font-body-sm text-on-surface-variant text-center">
              Sin registro: te damos un nombre de la corte y entrás a jugar.
            </p>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/30" />
            </div>
            <div className="relative flex justify-center text-body-sm">
              <span className="bg-surface-variant px-3 text-on-surface-variant">
                o con tu cuenta
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-label-caps font-label-caps text-on-surface-variant"
              >
                EMAIL
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
              />
            </div>

            {state === "error" && errorMsg && (
              <p className="text-body-sm font-body-sm text-error">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || state === "loading"}
              className="btn-gradient px-6 py-3 rounded-lg text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest disabled:opacity-50"
            >
              {state === "loading" ? "ENVIANDO..." : "ENVIAR LINK MÁGICO"}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/30" />
            </div>
            <div className="relative flex justify-center text-body-sm">
              <span className="bg-surface-variant px-3 text-on-surface-variant">
                o
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={pending || state === "loading"}
            className="w-full px-6 py-3 rounded-lg border border-outline-variant/50 text-label-caps font-label-caps text-on-surface-variant hover:text-on-surface hover:border-primary hover:bg-primary/10 transition-all font-bold tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <GoogleIcon />
            CONTINUAR CON GOOGLE
          </button>
        </>
      )}
    </div>
  );
}
