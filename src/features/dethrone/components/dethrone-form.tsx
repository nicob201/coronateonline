"use client";

import { useActionState } from "react";
import { destronar } from "@/actions/dethrone";
import { formatCoronas } from "@/lib/format";

interface DethroneFormProps {
  titleId: string;
  minAmount: number;
  balance: number;
  isHeld: boolean;
}

// Amount input + submit to spend Coronas on a title; blocks double-submit and shows what is missing when short.
export function DethroneForm({ titleId, minAmount, balance, isHeld }: DethroneFormProps) {
  const [state, action, pending] = useActionState(destronar, null);
  const missing = minAmount - balance;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="titleId" value={titleId} />

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
          max={balance}
          step={1}
          defaultValue={minAmount}
          className="w-full px-4 py-3 rounded-lg bg-surface-container-high border border-outline-variant/30 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors"
        />
      </div>

      <p className="text-body-sm font-body-sm text-on-surface-variant">
        Tu saldo: <span className="text-tertiary">{formatCoronas(balance)}</span>
      </p>

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
        disabled={pending || missing > 0}
        className="self-stretch text-center btn-destronar text-on-surface px-8 py-3 rounded-lg text-label-caps font-label-caps font-bold tracking-widest border border-secondary-container/50 disabled:opacity-50"
      >
        {missing > 0
          ? `TE FALTAN ${formatCoronas(missing)}`
          : pending
            ? "PROCESANDO..."
            : isHeld
              ? "DESTRONAR"
              : "CORONARME"}
      </button>
    </form>
  );
}
