import { redirect } from "next/navigation";
import { requireUser } from "@/services/auth.server";
import { getOwnProfile } from "@/services/profiles.server";
import { OnboardingForm } from "@/features/auth/components/onboarding-form";

// Shows the username/display-name form, or redirects home if onboarding is already complete.
export default async function OnboardingPage() {
  const { supabase, user } = await requireUser();
  const profile = await getOwnProfile(supabase, user.id);

  if (profile?.display_name) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <OnboardingForm defaultUsername={profile?.username ?? ""} />
    </div>
  );
}
