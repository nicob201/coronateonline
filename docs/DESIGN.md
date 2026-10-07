# CoronaTeOnline — Design Spec (v2)

*2026-08-23 — validation MVP. v2 2026-10-07 — Coronas (virtual currency) replace ARS; see `docs/ROADMAP.md`.*

## 1. Product

A status-market platform: users spend **Coronas (👑)**, a virtual currency, to hold unique, absurd/prestigious digital titles — "👑 Rey de Córdoba", "😂 CEO de los Lunes", "🍕 Rey de la Pizza". The holder gets the crown displayed on a shareable public profile. Anyone can dethrone them by paying more.

**Portfolio demo:** a visitor plays in 30 seconds without paying. Every account starts with 20 👑 (guests included); buying Coronas with a sandbox checkout comes later (roadmap D28).

## 2. Core Mechanic — Direct Takeover (NOT an auction)

There are no timers, no auction rounds, no bidding wars with countdowns.

- Every title has a current holder and a current price (what the holder paid).
- An unclaimed title can be claimed for the base price: **1 👑**.
- To dethrone the current holder you must pay at least **current price + 1 👑**.
- All amounts are positive integer Coronas (1 👑 = the $1.000 ARS unit of v1).
- Reigns do NOT expire. You hold the crown until someone pays more.

### Price decay (v1.1)

A held title's **current price is not static**. It is `price_paid` of the active
reign decayed toward a per-title floor: after a 3-day grace period the price
loses ~0.7%/day (compounding). The floor is
`max(1 👑, 25% of the title's recent price peak, 2 👑 × dethrones in the
last 30 days)`. So an undefended crown slowly gets cheaper (~6 months at the
default rate to reach its floor), a hot title keeps a high floor, and a title
that cooled off becomes affordable again. That high floor only holds while the
active reign's `price_paid` is still inside the peak window (`peak_window_days`,
default 90 days); once it ages out the peak term collapses and a long-undefended
crown decays toward the 1 👑 base. The dethrone threshold is `current effective price + 1 👑`.
All decay parameters live in a single-row `pricing_config` table, tunable with an
`UPDATE`. The effective price is computed on read (no cron, no stored column) by
the `title_current_price` Postgres function and exposed through the
`titles_priced` view.

### Dethrone flow (v1 — manual payment confirmation)

**Transitional (until roadmap D5).** D5 replaces it with `dethrone_with_coins`, an atomic RPC that debits the challenger's Coronas, transfers the crown and compensates the dethroned holder.

1. Logged-in user on a title page taps **"Destronar por X 👑"** (X ≥ current + 1, user may offer more).
2. Server creates a `claim` with status `pending` and shows payment instructions: a Mercado Pago payment link (created manually by the admin in the MP dashboard for now).
3. User pays outside the platform.
4. Admin confirms the payment in `/admin` → an atomic Postgres function applies the claim: ends the current reign, starts the new one.
5. The dethroned user's reign is closed and recorded in history.

Concurrency note: claims do not lock a title. If two users claim simultaneously, the first confirmed payment wins; the other claim gets rejected (and refunded manually). At MVP scale collisions are ~nonexistent.

## 3. Domain Model

Five tables. One source of truth: current holder and current price are always derived from `reigns`; a user's balance is always derived from `coin_ledger`.

### `profiles` (1:1 with `auth.users`)
- `id` (uuid, PK, FK → auth.users), `username` (unique slug, for `/@username`), `display_name`, `avatar_url`, `bio`
- Social links: `instagram`, `tiktok`, `youtube`, `x`, `twitch`, `website` (nullable text)
- `is_admin` (boolean, default false)
- Created automatically by a trigger on signup.

### `titles` (admin-seeded only in MVP)
- `id`, `slug` (unique), `name`, `emoji`, `description`, `created_at`
- No holder/price columns — derived from `reigns`.

### `reigns` (the history — feed and rankings are queries over this table)
- `id`, `title_id` (FK), `user_id` (FK → profiles), `price_paid` (integer 👑), `started_at`, `ended_at` (nullable)
- **Active reign = `ended_at IS NULL`.** Partial unique index: at most one active reign per title.
- The **current price is derived, then time-decayed**: `title_current_price(title_id)`
  applies `pricing_config` decay to the active reign's `price_paid` / `started_at`,
  floored by `title_price_floor(title_id)`. `reigns.price_paid` always records the
  real amount paid; decay only affects the live threshold, never stored history.
- Activity feed = recent reigns ordered by `started_at`. Season number = position in the title's reign sequence.

### `claims` (dethrone attempts / payment tracking)
- `id`, `title_id`, `user_id`, `amount` (integer 👑), `status` (`pending` | `applied` | `rejected`), `created_at`, `resolved_at`
- Created via an RPC that validates amount server-side against the live current price.
- Applied only by the admin through the atomic transfer function.

### `coin_ledger` (the wallet — append-only)
- `id`, `user_id` (FK → profiles), `amount` (signed integer 👑: credit > 0, debit < 0), `reason` (`welcome` today; D5 adds `dethrone` / `dethroned`, D6 `salary`), `created_at`
- **Balance is derived**: `coin_balance(user_id)` = sum of the user's rows. Never stored.
- 20 👑 `welcome` row per profile, inserted by a trigger on `profiles`; a unique partial index allows only one.
- RLS: owners read their own rows; no client writes — only `SECURITY DEFINER` code writes the ledger.

### Database rules
- RLS enabled on every table. Public read for `profiles`, `titles`, `reigns`. Claims readable by owner (+ admin). No client-side writes to `titles`/`reigns` — transfers happen exclusively inside a `SECURITY DEFINER` function.
- Money integrity enforced by CHECK constraints (positive amounts; non-zero ledger movements).

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
