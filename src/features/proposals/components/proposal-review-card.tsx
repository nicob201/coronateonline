"use client";

import Link from "next/link";
import { useActionState } from "react";
import { revisarPropuesta } from "@/actions/proposals";
import { formatDate } from "@/lib/format";
import type { PendingProposal } from "@/types";

const BUTTON =
  "flex-1 px-6 py-3 rounded-xl text-label-caps font-label-caps font-bold tracking-widest disabled:opacity-50";

// One pending proposal with approve / reject; both buttons lock while the review is in flight.
export function ProposalReviewCard({ proposal }: { proposal: PendingProposal }) {
  const [state, action, pending] = useActionState(revisarPropuesta, null);

  return (
    <form action={action} className="glass-panel rounded-xl p-6 flex flex-col gap-4">
      <input type="hidden" name="proposalId" value={proposal.id} />
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className="text-4xl">
          {proposal.emoji}
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <h2 className="text-title-md font-title-md text-on-surface break-words">{proposal.name}</h2>
          <p className="text-body-sm font-body-sm text-on-surface-variant break-words">{proposal.description}</p>
          <p className="text-label-caps font-label-caps text-on-surface-variant">
            <Link href={`/@${proposal.authorUsername}`} className="text-primary hover:text-tertiary">
              {proposal.authorName}
            </Link>{" "}
            · {formatDate(proposal.created_at)}
          </p>
        </div>
      </div>

      {state?.success === false && (
        <p role="alert" className="text-body-sm font-body-sm text-error">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className={`${BUTTON} btn-gradient text-on-primary-fixed`}
        >
          {pending ? "..." : "APROBAR"}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          className={`${BUTTON} border border-outline-variant/40 text-on-surface hover:border-error hover:text-error transition-colors`}
        >
          RECHAZAR Y REEMBOLSAR
        </button>
      </div>
    </form>
  );
}
