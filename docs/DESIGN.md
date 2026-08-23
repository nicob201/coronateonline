# CoronaTeOnline — MVP Design Spec

*2026-08-23 — approved design for the validation MVP.*

## 1. Product

A status-market platform: users pay real money (ARS) to hold unique, absurd/prestigious digital titles — "👑 Rey de Córdoba", "😂 CEO de los Lunes", "🍕 Rey de la Pizza". The holder gets the crown displayed on a shareable public profile. Anyone can dethrone them by paying more.

**Hypothesis to validate:** are people willing to pay real money for an absurd digital title to show off? Success metric: first 10–20 real payments. Everything in this MVP is scoped to answering that question — nothing more.

## 2. Core Mechanic — Direct Takeover (NOT an auction)

There are no timers, no auction rounds, no bidding wars with countdowns.

- Every title has a current holder and a current price (what the holder paid).
- An unclaimed title can be claimed for the base price: **$1.000 ARS**.
- To dethrone the current holder you must pay at least **current price + $1.000**.
- All amounts are integer ARS, multiples of $1.000 ($1.000 = 1 unit).
- Reigns do NOT expire. You hold the crown until someone pays more.

### Dethrone flow (v1 — manual payment confirmation)

1. Logged-in user on a title page taps **"Destronar por $X"** (X ≥ current + 1.000, user may offer more).
2. Server creates a `claim` with status `pending` and shows payment instructions: a Mercado Pago payment link (created manually by the admin in the MP dashboard for now).
3. User pays outside the platform.
4. Admin confirms the payment in `/admin` → an atomic Postgres function applies the claim: ends the current reign, starts the new one.
5. The dethroned user's reign is closed and recorded in history.

**Upgrade path (post-validation):** step 2–4 get replaced by Mercado Pago Checkout Pro (generated preference + webhook auto-confirms the claim). The `claims` table already models this — no schema change needed.

Concurrency note: claims do not lock a title. If two users claim simultaneously, the first confirmed payment wins; the other claim gets rejected (and refunded manually). At MVP scale collisions are ~nonexistent.

## 3. Domain Model

Four tables. One source of truth: current holder and current price are always derived from `reigns`.

### `profiles` (1:1 with `auth.users`)
- `id` (uuid, PK, FK → auth.users), `username` (unique slug, for `/@username`), `display_name`, `avatar_url`, `bio`
- Social links: `instagram`, `tiktok`, `youtube`, `x`, `twitch`, `website` (nullable text)
- `is_admin` (boolean, default false)
- Created automatically by a trigger on signup.

### `titles` (admin-seeded only in MVP)
- `id`, `slug` (unique), `name`, `emoji`, `description`, `created_at`
- No holder/price columns — derived from `reigns`.

### `reigns` (the history — feed and rankings are queries over this table)
- `id`, `title_id` (FK), `user_id` (FK → profiles), `price_paid` (integer ARS), `started_at`, `ended_at` (nullable)
- **Active reign = `ended_at IS NULL`.** Partial unique index: at most one active reign per title.
- Activity feed = recent reigns ordered by `started_at`. Season number = position in the title's reign sequence.

### `claims` (dethrone attempts / payment tracking)
- `id`, `title_id`, `user_id`, `amount` (integer ARS), `status` (`pending` | `applied` | `rejected`), `created_at`, `resolved_at`
- Created via an RPC that validates amount server-side against the live current price.
- Applied only by the admin through the atomic transfer function.

### Database rules
- RLS enabled on every table. Public read for `profiles`, `titles`, `reigns`. Claims readable by owner (+ admin). No client-side writes to `titles`/`reigns` — transfers happen exclusively inside a `SECURITY DEFINER` function.
- Money integrity enforced by CHECK constraints (positive, multiple of 1000).

## 4. Pages (MVP)

| Route | Content |
|---|---|
| `/` | Landing: hero, featured titles with current holder + price, activity feed (latest coronations) |
| `/titulos` | Grid of all titles with crown, holder, current price |
| `/t/[slug]` | Title detail: current holder, price, dethrone button, reign history ("Temporada #N") |
| `/@[username]` | Public shareable profile: avatar, current title(s), bio, social links, reign history |
| `/login` | Supabase Auth: email magic link + Google OAuth; username onboarding on first login |
| `/admin` | Pending claims list with confirm/reject (DB-checked admin only) |

UI copy in Spanish (es-AR). Visual direction: dark, cyberpunk + digital luxury (electric violet, magenta, gold, neon, glassmorphism) — Stitch designs exist and drive the styling pass.

## 5. Out of Scope (MVP)

Deliberately excluded until the hypothesis validates:
- Integrated payments (MP Checkout Pro + webhooks) — first upgrade after validation
- Realtime updates (Supabase Realtime) — normal revalidation is enough
- Notifications (email/push "te destronaron") — dethroned users see it on-site
- User-created titles, rankings pages, profile boosts, sponsored titles
- Reign expiry (does not exist in the takeover model)

## 6. Stack

Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase (Postgres/Auth) + Zod, deployed on Vercel free tier. Architecture, layers, and code rules: see `AGENTS.md`.

## 7. Build Roadmap

Each step is one feature branch, implemented via one prompt, reviewed by diff:

1. **Supabase foundation** — env validation, Supabase clients, auth middleware, migration 0001 (schema + RLS + functions + trigger), seed titles, generated DB types
2. **Auth** — login (magic link + Google), auth callback, username onboarding
3. **Titles** — landing, titles grid, title detail with history
4. **Dethrone flow** — claim creation + payment instructions screen
5. **Public profiles** — `/@username`
6. **Admin** — claim confirmation
7. **Design pass** — apply Stitch designs, OG/share cards
