import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedUser } from "@/services/auth.server";
import { getBalance } from "@/services/wallet.server";
import { getOwnProposals } from "@/services/proposals.server";
import { formatCoronas } from "@/lib/format";
import { TITLE_PROPOSAL_COST } from "@/lib/titles";
import { ProposeTitleForm } from "@/features/proposals/components/propose-title-form";

export const metadata: Metadata = {
  title: "Crear título - CoronaTeOnline",
  robots: { index: false, follow: false },
};

// Lets a signed-in player propose a new title; while one is in review it shows that one instead.
export default async function NewTitlePage() {
  const { supabase, user } = await requireOnboardedUser();
  const [balance, proposals] = await Promise.all([
    getBalance(supabase, user.id),
    getOwnProposals(supabase, user.id),
  ]);
  const pending = proposals.find((p) => p.status === "pending");

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[720px] pt-16 pb-32 flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
          Creá tu <span className="text-gradient-primary">título</span>
        </h1>
        <p className="text-body-lg font-body-lg text-on-surface-variant">
          Inventalo, pagá {formatCoronas(TITLE_PROPOSAL_COST)} y lo revisamos. Si lo aprobamos, entra
          en juego y vos quedás coronado como su primer rey. Si no, te devolvemos las Coronas.
        </p>
      </div>

      {pending ? (
        <div className="glass-panel rounded-xl p-8 flex flex-col items-center text-center gap-3">
          <span aria-hidden="true" className="text-6xl">
            {pending.emoji}
          </span>
          <h2 className="text-title-md font-title-md text-on-surface">«{pending.name}» está en revisión</h2>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Podés tener una propuesta a la vez. Cuando la revisemos la vas a ver en tu perfil.
          </p>
          <Link
            href="/perfil"
            className="text-label-caps font-label-caps text-primary hover:text-tertiary transition-colors"
          >
            Ir a mi perfil
          </Link>
        </div>
      ) : (
        <ProposeTitleForm balance={balance} />
      )}
    </main>
  );
}
