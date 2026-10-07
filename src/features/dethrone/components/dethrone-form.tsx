"use client";

import { useActionState } from "react";
import { destronar } from "@/actions/claims";
import { formatCoronas } from "@/lib/format";

interface DethroneFormProps {
  titleId: string;
  slug: string;
  minAmount: number;
  isHeld: boolean;
}

// Amount input + submit for creating a pending dethrone claim; blocks double-submit while pending.
export function DethroneForm({ titleId, slug, minAmount, isHeld }: DethroneFormProps) {
  const [state, action, pending] = useActionState(destronar, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="titleId" value={titleId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="amount"
          className="text-label-caps font-label-caps text-on-surface-variant"
        >
          TU OFERTA (MÍNIMO {formatCoronas(minAmount)})
        </label>
        <input
          id="amount"
          name="amount"
          type="number"
          required
          min={minAmount}
          step={1}
          defaultValue={minAmount}
          className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="message"
          className="text-label-caps font-label-caps text-on-surface-variant"
        >
          TU MENSAJE AL CORONARTE (OPCIONAL)
        </label>
        <textarea
          id="message"
          name="message"
          maxLength={80}
          rows={2}
          className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors resize-none"
        />
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          Máx. 80 caracteres
        </span>
      </div>

      {state?.success === false && state.error && (
        <p className="text-body-sm font-body-sm text-error">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-stretch text-center btn-destronar text-on-surface px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest border border-secondary-container/50 disabled:opacity-50"
      >
        {pending
          ? "PROCESANDO..."
          : isHeld
            ? "DESTRONAR"
            : "CORONARME"}
      </button>
    </form>
  );
}
