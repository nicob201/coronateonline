import type { Metadata } from "next";
import { requireAdmin } from "@/services/auth.server";
import { getPendingClaims } from "@/services/claims.server";
import { PendingClaimsTable } from "@/features/admin/components/pending-claims-table";

export const metadata: Metadata = {
  title: "Admin - CoronaTeOnline",
  robots: { index: false, follow: false },
};

// Admin-only queue of pending claims with confirm/reject actions.
export default async function AdminPage() {
  const { supabase } = await requireAdmin();
  const claims = await getPendingClaims(supabase);

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[900px] pt-16 pb-32 flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
          Solicitudes <span className="text-gradient-primary">pendientes</span>
        </h1>
        <p className="text-body-sm font-body-sm text-on-surface-variant">
          Confirmá una solicitud solo después de verificar el pago. La corona se
          transfiere de forma atómica.
        </p>
      </div>

      <PendingClaimsTable claims={claims} />
    </main>
  );
}
