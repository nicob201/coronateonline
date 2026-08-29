"use client";

import { useActionState } from "react";
import { resolverClaim } from "@/actions/claims";
import { formatARS, formatReignDuration } from "@/lib/format";
import type { PendingClaimListItem } from "@/types";

function ClaimRow({ claim }: { claim: PendingClaimListItem }) {
  const [state, action, pending] = useActionState(resolverClaim, null);

  return (
    <form
      action={action}
      className="flex flex-col gap-3 p-4 border-b border-white/10 last:border-b-0 md:flex-row md:items-center md:justify-between"
    >
      <input type="hidden" name="claimId" value={claim.id} />
      <input type="hidden" name="slug" value={claim.titleSlug} />

      <div className="flex flex-col gap-0.5">
        <span className="text-body-lg font-body-lg font-bold text-on-surface">
          {claim.titleName}
        </span>
        <span className="text-label-caps font-label-caps text-on-surface-variant">
          {claim.claimantName} · hace {formatReignDuration(claim.createdAt)}
        </span>
        {state?.success === false && state.error && (
          <span className="text-body-sm font-body-sm text-error">{state.error}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-title-md font-title-md text-tertiary font-black">
          {formatARS(claim.amount)}
        </span>
        <button
          type="submit"
          name="decision"
          value="apply"
          disabled={pending}
          className="px-4 py-2 rounded-lg text-label-caps font-label-caps font-bold tracking-widest btn-gradient text-on-primary-fixed disabled:opacity-50"
        >
          {pending ? "..." : "CONFIRMAR"}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className="px-4 py-2 rounded-lg text-label-caps font-label-caps font-bold tracking-widest border border-outline-variant/40 text-on-surface-variant hover:text-error hover:border-error disabled:opacity-50 transition-colors"
        >
          RECHAZAR
        </button>
      </div>
    </form>
  );
}

// Admin queue: one row per pending claim with confirm/reject actions.
export function PendingClaimsTable({ claims }: { claims: PendingClaimListItem[] }) {
  if (claims.length === 0) {
    return (
      <p className="text-body-sm font-body-sm text-on-surface-variant">
        No hay solicitudes pendientes.
      </p>
    );
  }

  return (
    <div className="glass-panel rounded-xl flex flex-col overflow-hidden">
      {claims.map((claim) => (
        <ClaimRow key={claim.id} claim={claim} />
      ))}
    </div>
  );
}
