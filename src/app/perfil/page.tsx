import type { Metadata } from "next";
import Link from "next/link";
import { requireOnboardedUser } from "@/services/auth.server";
import { ProfileEditForm } from "@/features/profile/components/profile-edit-form";

export const metadata: Metadata = {
  title: "Editar perfil - CoronaTeOnline",
  robots: { index: false, follow: false },
};

// Lets the authenticated user edit their own profile.
export default async function EditProfilePage() {
  const { profile } = await requireOnboardedUser();

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[720px] pt-16 pb-32 flex flex-col gap-8">
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

      <ProfileEditForm profile={profile} />
    </main>
  );
}
