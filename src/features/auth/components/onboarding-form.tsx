"use client";

import { useActionState } from "react";
import { updateProfile } from "@/actions/profiles";

interface OnboardingFormProps {
  defaultUsername: string;
}

export function OnboardingForm({ defaultUsername }: OnboardingFormProps) {
  const [state, action, pending] = useActionState(updateProfile, null);

  return (
    <div className="glass-panel rounded-2xl p-8 w-full max-w-md">
      <h1 className="text-headline-lg-mobile font-headline-lg-mobile text-on-surface mb-2 uppercase tracking-tighter text-center">
        <span className="text-gradient-primary">Tu identidad</span>
      </h1>
      <p className="text-body-sm font-body-sm text-on-surface-variant mb-8 text-center">
        Elegí tu username y nombre para coronarte.
      </p>

      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="username"
            className="text-label-caps font-label-caps text-on-surface-variant"
          >
            USERNAME
          </label>
          <div className="flex items-center">
            <span className="text-on-surface-variant mr-1">@</span>
            <input
              id="username"
              name="username"
              type="text"
              required
              defaultValue={defaultUsername}
              pattern="[a-z0-9_]{3,20}"
              title="Solo letras minúsculas, números y guión bajo. 3-20 caracteres."
              className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="display_name"
            className="text-label-caps font-label-caps text-on-surface-variant"
          >
            NOMBRE
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            maxLength={50}
            placeholder="Tu nombre para mostrarte"
            className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
          />
        </div>

        {state?.success === false && state.error && (
          <p className="text-body-sm font-body-sm text-error">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="btn-gradient px-6 py-3 rounded-lg text-label-caps font-label-caps text-on-primary-fixed font-bold tracking-widest disabled:opacity-50 mt-2"
        >
          {pending ? "GUARDANDO..." : "CORONATE"}
        </button>
      </form>
    </div>
  );
}
