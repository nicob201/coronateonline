import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Verifies the magic-link email OTP and redirects based on onboarding status.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  // Only allow relative redirects.
  const safeNext = next.startsWith("/") ? next : "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type as "email",
  });

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_token`);
  }

  return afterLoginRedirect(supabase, origin, safeNext);
}

// Shared post-login redirect: checks if user needs onboarding.
async function afterLoginRedirect(
  supabase: Awaited<ReturnType<typeof createClient>>,
  origin: string,
  next: string,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.display_name) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
