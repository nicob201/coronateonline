import Link from "next/link";
import { formatDate } from "@/lib/format";
import type { OwnProposal } from "@/types";

function Status({ proposal }: { proposal: OwnProposal }) {
  if (proposal.status === "approved" && proposal.titleSlug) {
    return (
      <Link href={`/t/${proposal.titleSlug}`} className="text-tertiary hover:underline">
        Aprobado · ver título
      </Link>
    );
  }
  if (proposal.status === "rejected") {
    return <span className="text-on-surface-variant">Rechazado · reembolsado</span>;
  }
  return <span className="text-primary">En revisión</span>;
}

// The user's latest title proposals with their review status, plus the way in to create one.
export function MyProposals({ proposals }: { proposals: OwnProposal[] }) {
  return (
    <section className="glass-panel rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant">MIS PROPUESTAS</h2>
        <Link
          href="/titulos/nuevo"
          className="whitespace-nowrap text-label-caps font-label-caps text-primary hover:text-tertiary transition-colors"
        >
          + Crear título
        </Link>
      </div>
      {proposals.length === 0 ? (
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Todavía no propusiste ningún título.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/20">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="flex items-center gap-3 py-2 text-body-sm font-body-sm">
              <span aria-hidden="true" className="text-xl">
                {proposal.emoji}
              </span>
              <span className="flex-1 min-w-0 truncate text-on-surface">{proposal.name}</span>
              <span className="hidden sm:inline text-on-surface-variant">{formatDate(proposal.created_at)}</span>
              <Status proposal={proposal} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
