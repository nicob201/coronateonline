import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/services/auth.server";

// Exchanges the OAuth code for a session and redirects based on onboarding status.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  // Only allow relative redirects.
  const safeNext = next.startsWith("/") ? next : "/";

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const path = await getPostLoginRedirectPath(supabase, safeNext);
  return NextResponse.redirect(`${origin}${path}`);
}
