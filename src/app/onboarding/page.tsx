import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "@/features/auth/components/onboarding-form";

// Redirects to home if not authenticated, shows onboarding if display_name is missing.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  // If user already completed onboarding, redirect to home.
  if (profile?.display_name) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <OnboardingForm defaultUsername={profile?.username ?? ""} />
    </div>
  );
}
