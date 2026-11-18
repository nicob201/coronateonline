import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedUser } from "@/services/auth.server";
import { getNotifications } from "@/services/notifications.server";
import { ProfileEditForm } from "@/features/profile/components/profile-edit-form";
import { DethroneBanner } from "@/features/profile/components/dethrone-banner";
import { WalletCard } from "@/features/profile/components/wallet-card";
import { getBalance, getRecentMovements, getSalaryStatus } from "@/services/wallet.server";
import { getOwnProposals } from "@/services/proposals.server";
import { MyProposals } from "@/features/proposals/components/my-proposals";
import { SaveAccountCard } from "@/features/auth/components/save-account-card";
import { linkResultSchema } from "@/features/auth/schemas/link-result.schema";

export const metadata: Metadata = {
  title: "Editar perfil - CoronaTeOnline",
  robots: { index: false, follow: false },
};

// Lets the authenticated user edit their own profile; guests also get the card to save their account.
export default async function EditProfilePage({ searchParams }: PageProps<"/perfil">) {
  const { supabase, user, profile } = await requireOnboardedUser();
  const link = linkResultSchema.parse(await searchParams);
  const [notifications, balance, salary, movements, proposals] = await Promise.all([
    getNotifications(supabase, user.id),
    getBalance(supabase, user.id),
    getSalaryStatus(supabase),
    getRecentMovements(supabase, user.id),
    getOwnProposals(supabase, user.id),
  ]);
  const dethroneNotice = notifications.items[0] ?? null;

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[720px] pt-16 pb-32 flex flex-col gap-8">
      {user.is_anonymous && <SaveAccountCard linkError={link.error} />}
      {!user.is_anonymous && link.vincular === "google" && (
        <p role="status" className="glass-panel rounded-xl p-4 text-body-sm font-body-sm text-tertiary">
          Listo: tu cuenta quedó guardada con Google. Ya podés entrar desde cualquier dispositivo.
        </p>
      )}
      {dethroneNotice && <DethroneBanner notice={dethroneNotice} />}

      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-headline-lg-mobile md:text-display-xl font-display-xl text-on-surface uppercase tracking-tighter">
          Editar <span className="text-gradient-primary">perfil</span>
        </h1>
        <Link
          href={`/@${profile.username}`}
          className="text-label-caps font-label-caps text-on-surface-variant hover:text-primary transition-colors"
        >
          Ver perfil
        </Link>
      </div>

      <WalletCard balance={balance} salary={salary} movements={movements} />

      <MyProposals proposals={proposals} />

      <ProfileEditForm profile={profile} />
    </main>
  );
}
