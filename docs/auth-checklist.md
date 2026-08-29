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

## Authentication → Security & Protection

- [ ] **Leaked password protection**: ON (HaveIBeenPwned).
- [ ] **Bot/abuse protection** (Captcha): consider enabling before public launch.
- [ ] **Rate limits**: keep defaults (magic-link sends throttled per IP/email).
- [ ] **Max signups**: leave default unless invite-only.

## Database

- [ ] Migrations `0001_init.sql` and `0002_harden.sql` applied (`supabase db push`).
- [ ] Seed applied (`supabase db push` does not seed — run `supabase/seed.sql` manually or via `supabase db reset` locally).
- [ ] At least one `profiles` row has `is_admin = true` (set manually via SQL editor).
- [ ] RLS shows **enabled** on `profiles`, `titles`, `reigns`, `claims` in Table Editor.

## Known gaps (tracked, not yet fixed)

- **Onboarding is bypassable**: a signed-in user with no `display_name` can use
  the app. `requireOnboardedUser()` exists — the dethrone action (roadmap step 4)
  MUST call it so nameless profiles cannot hold a reign.
