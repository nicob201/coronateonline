import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicProfile } from "@/services/profiles.server";
import { ProfileHeader } from "@/features/profile/components/profile-header";
import { ProfileReignList } from "@/features/profile/components/profile-reign-list";

// Resolves the "@handle" URL segment to a bare username, or null if it is not a profile path.
function parseHandle(segment: string): string | null {
  const decoded = decodeURIComponent(segment);
  return decoded.startsWith("@") && decoded.length > 1 ? decoded.slice(1) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[username]">): Promise<Metadata> {
  const username = parseHandle((await params).username);
  if (!username) return {};

  const supabase = await createClient();
  const profile = await getPublicProfile(supabase, username);
  if (!profile) return { title: "Perfil no encontrado - CoronaTeOnline" };

  const crown = profile.currentReigns[0];
  return {
    title: `${profile.displayName} (@${profile.username}) - CoronaTeOnline`,
    description: crown
      ? `${profile.displayName} reina en ${crown.titleName}.`
      : profile.bio ?? `El perfil de ${profile.displayName} en CoronaTeOnline.`,
  };
}

// Public shareable profile: identity, current crowns and full reign history.
export default async function ProfilePage({ params }: PageProps<"/[username]">) {
  const username = parseHandle((await params).username);
  if (!username) notFound();

  const supabase = await createClient();
  const profile = await getPublicProfile(supabase, username);
  if (!profile) notFound();

  return (
    <main className="relative z-10 container mx-auto px-5 md:px-16 max-w-[900px] pt-16 pb-32 flex flex-col gap-10">
      <ProfileHeader profile={profile} />

      <div className="flex flex-col gap-4">
        <h2 className="text-title-md font-title-md text-on-surface border-b border-outline-variant/30 pb-2">
          HISTORIAL DE REINADOS
        </h2>
        <ProfileReignList
          currentReigns={profile.currentReigns}
          pastReigns={profile.pastReigns}
        />
      </div>
    </main>
  );
}
