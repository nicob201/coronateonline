"use client";

import { useActionState } from "react";
import { cobrarSueldo } from "@/actions/salary";
import { formatCoronas } from "@/lib/format";
import type { ActionResult } from "@/types";

// Claims today's salary; disabled while pending so a double click cannot fire two claims.
export function SalaryButton({ amount }: { amount: number }) {
  const [state, action, pending] = useActionState<ActionResult<number> | null>(cobrarSueldo, null);

  return (
    <form action={action} className="flex flex-col gap-1.5">
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-lg border border-tertiary/50 text-tertiary text-label-caps font-label-caps font-bold tracking-widest hover:bg-tertiary/10 transition-colors disabled:opacity-50"
      >
        {pending ? "COBRANDO..." : `COBRAR SUELDO +${formatCoronas(amount)}`}
      </button>
      {state?.success === false && (
        <p className="text-body-sm font-body-sm text-error">{state.error}</p>
      )}
    </form>
  );
}
