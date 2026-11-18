import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPostLoginRedirectPath } from "@/services/auth.server";

// Exchanges the OAuth code for a session and redirects based on onboarding status.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = safeNextPath(searchParams.get("next"));

  if (!code) {
    // A refused Google link (that Google already has an account, or the user backed out) returns to the page that started it.
    const refused = searchParams.get("error_code") ?? searchParams.get("error");
    if (refused && searchParams.has("next")) {
      const back = new URL(safeNext, origin);
      back.searchParams.set("error", refused);
      return NextResponse.redirect(back);
    }
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const path = await getPostLoginRedirectPath(supabase, safeNext);
  return NextResponse.redirect(`${origin}${path}`);
}
