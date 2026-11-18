# Auth hardening checklist (Supabase Cloud dashboard)

`supabase/config.toml` only configures the **local** stack. The cloud project's
auth settings live in the dashboard and must be verified there.

## Authentication → URL Configuration

- [ ] **Site URL** = production Vercel URL (`https://coronateonline.vercel.app` or custom domain).
- [ ] **Redirect Allowlist** contains exactly:
  - `http://localhost:3000/auth/callback`
  - `https://<production-domain>/auth/callback`
  - Vercel preview pattern if used: `https://coronateonline-*.vercel.app/auth/callback`
- [ ] No wildcard `**` entries.

## Authentication → Providers

- [ ] **Email**: enabled. Confirm email = ON. OTP expiry ≤ 3600s. OTP length ≥ 6.
- [ ] **Google**: Client ID / Secret set. Authorized redirect URI in Google Cloud
      console = `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] **Anonymous sign-ins**: enabled (guest entry, D3).

## Authentication → Security & Protection

- [ ] **Rate limits**: anonymous sign-ins = 10 per hour per IP (D23); keep the other defaults.
- [ ] **Bot/abuse protection** (Captcha): off; enable only if guest abuse shows up.
- [ ] **Max signups**: leave default unless invite-only.

## Database

- [ ] Every migration in `supabase/migrations/` applied (`supabase db push`).
- [ ] Seed applied (`supabase db push` does not seed — run `supabase/seed.sql` manually or via `supabase db reset` locally).
- [ ] At least one `profiles` row has `is_admin = true` (set manually via SQL editor) to moderate title proposals at `/admin`.
- [ ] RLS enabled on every `public` table (`supabase/tests/permissions_test.sql` checks it in CI).

## Known gaps (tracked, not yet fixed)

- **Onboarding is bypassable**: a signed-in user with no `display_name` can still
  dethrone, react and claim the salary; the UI falls back to `@username`. Guests get
  a name on entry, so only email/Google users who skip `/onboarding` hit this.
