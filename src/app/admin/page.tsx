import type { Metadata } from "next";
import { requireAdmin } from "@/services/auth.server";
import { getPendingProposals } from "@/services/proposals.server";
import { ProposalReviewCard } from "@/features/proposals/components/proposal-review-card";

// No title: the metadata also reaches the 404 that non-admins get, and must not reveal the page.
export const metadata: Metadata = { robots: { index: false, follow: false } };

// Admin review queue: pending title proposals, oldest first, each with approve / reject.
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const proposals = await getPendingProposals(supabase);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[900px] pt-16 pb-32 flex flex-col gap-8">
      <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
        Propuestas <span className="text-gradient-primary">pendientes</span>
      </h1>
      {proposals.length === 0 ? (
        <p className="text-body-lg font-body-lg text-on-surface-variant">No hay propuestas para revisar.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {proposals.map((proposal) => (
            <li key={proposal.id}>
              <ProposalReviewCard proposal={proposal} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
