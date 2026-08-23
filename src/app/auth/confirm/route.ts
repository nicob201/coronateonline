import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/services/auth.server";

const VALID_OTP_TYPES = ["email"] as const;

// Verifies the magic-link email OTP and redirects based on onboarding status.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  if (!(VALID_OTP_TYPES as readonly string[]).includes(type)) {
    return NextResponse.redirect(`${origin}/login?error=invalid_token`);
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

  const path = await getPostLoginRedirectPath(supabase, safeNext);
  return NextResponse.redirect(`${origin}${path}`);
}
