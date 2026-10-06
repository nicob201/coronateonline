import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/features/auth/components/login-form";

// Redirects to `next` if already authenticated, otherwise shows the login form.
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : null);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(nextPath);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <LoginForm next={nextPath === "/" ? undefined : nextPath} />
    </div>
  );
}
