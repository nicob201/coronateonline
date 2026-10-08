<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md — CoronaTeOnline

CoronaTeOnline is a status-market web platform where users spend Coronas (👑), a virtual currency, to hold absurd/prestigious digital titles ("Rey de Córdoba", "CEO de los Lunes"). Whoever pays the current price + minimum increment dethrones the current holder. Full product/technical spec: `docs/DESIGN.md` — read it before implementing any feature.

Follow the most restrictive rule when guidelines conflict.

## 1. Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # route typegen + tsc --noEmit
npm run test         # Vitest
npm run verify       # lint + typecheck + test + build (same as CI)
```

## 2. Stack & Architecture

- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (Postgres + Auth), Zod v4.
- Deployed on Vercel. Single app at repo root, source under `src/`.

### Data flow

```
Server Component (initial data fetch)
  → Client Component (receives initialData prop)
    → Server Action (orchestrates)
      → Service (business logic + DB)
        → Supabase
```

### Layers under `src/`

| Path | Role | Rules |
|---|---|---|
| `app/` | Next.js pages (App Router) | Thin wrappers: call a data service, pass props to components. NO inline fetching or computation logic. |
| `actions/` | Server Actions (`'use server'`) | Orchestration only: auth → authz → validate → service → revalidate. Return `ActionResult<T>`. |
| `services/` | ALL business logic and Supabase queries | `*.server.ts` for server-only. No HTTP responses — throw typed errors or return data objects. |
| `features/[name]/` | Feature-scoped code | Self-contained: `components/`, `hooks/`, `schemas/`. Needed by 2+ features → move to `lib/` or `components/shared/`. |
| `components/` | Shared UI components | Decoupled, presentational. |
| `lib/supabase/` | Supabase clients | `server.ts` (RSC/Actions/Route Handlers), `client.ts` (browser), `admin.ts` (service role — see Security). |
| `lib/` | Shared utilities, `env.ts` (Zod-validated env) | Used by only one feature → put it inside that feature. |
| `types/database.types.ts` | Auto-generated from Supabase | NEVER edit by hand. |
| `types/index.ts` | Re-exports, `ActionResult<T>`, composite types | |

### Dependency direction (low → high)

```
lib/ → services/ → actions/ → features/ → app/
```

- `lib/` must NEVER import from `features/` or `app/`. `features/` must NEVER import from `app/`. A feature must NOT import from another feature.
- `*.server.ts` = server-only execution. Never import server-only modules in client components.

### Database (Supabase)

- Schema lives in `supabase/migrations/*.sql`, versioned in git. Seed data in `supabase/seed.sql`. Never change schema outside a migration file.
- The local stack (`npx supabase start`) keeps the CLI default ports 5432x (other local projects, like docuauto, use other ranges). `dev`, `build` and `test:sql` first run `scripts/check-local-supabase.mjs`, which fails when a local `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_DB_URL` is not published by this project's containers.
- Money is **integer Coronas (👑)** (no decimals, no floats). Prices and dethrone amounts are positive; `coin_ledger` movements are signed (credit > 0, debit < 0). A user's balance is derived from `coin_ledger` via `coin_balance()` — never stored.
- The current reign of a title is the `reigns` row with `ended_at IS NULL`. Current holder and current price are DERIVED from `reigns` — never duplicated in other tables.
- Crown transfers (end reign + start reign) happen ONLY inside an atomic `SECURITY DEFINER` Postgres function — never in application code.
- Every table has RLS enabled with explicit policies. Client-side writes to `titles` and `reigns` are forbidden by policy.

## 3. Code Rules (STRICT)

### TypeScript

- `any` is prohibited. All functions and variables explicitly typed.
- NO type assertions (`as X`, `as unknown as X`) on Supabase responses. Derive types via `.select()` inference (with the `<Database>` generic on the client), `QueryData<typeof query>`, or `Database['public']['Tables']['X']['Row']`.
- Domain/database types come from `@/types` (single source of truth). Local interfaces ONLY for component props or strictly isolated utilities.

### Security & Ownership (CRITICAL)

- Never trust the frontend. Validate every input with Zod at every server boundary (Server Actions, Route Handlers).
- Every price/amount is re-validated server-side against the database (current price + minimum increment), never taken from the client, even if the UI already computed it.
- Every backend operation verifies the authenticated `auth.uid()` against the resource owner. Fail securely: generic 403/404, never leak existence.
- `lib/supabase/admin.ts` (service role, bypasses RLS) is ONLY for intentionally public/system operations — NEVER for authenticated user operations.
- Dethrones happen only through the `dethrone_with_coins` RPC (price, balance and transfer validated atomically in Postgres). Admin-only operations, when they exist, check `profiles.is_admin` in the database — never a client-provided value.

### React / Next.js

- Server Components by default. `"use client"` only when interactivity/hooks are strictly needed.
- Data fetching happens in Server Components, passed as `initialData` props to Client Components. No `useEffect` fetch-on-render waterfalls.
- Pagination/search/sort/tab state goes in URL search params (`useSearchParams`), not `useState`.
- Hydration safety: ALWAYS pass an explicit locale (`'es-AR'`) to `.toLocaleString()`, `.toLocaleDateString()`, `.toLocaleTimeString()`, and `Intl.NumberFormat`. Parameterless calls are prohibited.
- UI copy is Spanish (Argentina). Code, identifiers, and comments are English.

### Environment

- All env vars validated via Zod in `src/lib/env.ts`. Do not access `process.env` outside `lib/env.ts` and `lib/supabase/*`. Never commit `.env*` files (`.env.example` is the template).

### Quality

- Duplicate logic prohibited. Dead code prohibited. Remove obsolete imports after refactors.
- No `console.log` in production code paths.
- ESM imports only, `@/*` alias for `./src/*`, real UTF-8 characters (no `\uXXXX` escapes).
- One short single-line English comment before each exported function saying what it does. No multi-line comment blocks. Don't comment the obvious.
- Async actions handle loading/success/failure explicitly. Prevent double-submit on money-related actions.
- No speculative architecture: no factories, managers, contexts, or hooks without a clear present need. Reuse existing patterns before creating new ones. Minimal, incremental, low-risk changes.
- If a workflow uploads a file to Storage AND writes to the DB, include rollback: DB write fails → delete the uploaded file.

## 4. Testing

- Vitest (added with the first service that has real logic). Test files co-located in `__tests__/` next to the code. Mock Supabase with a chainable mock helper. Builders use `Partial<DomainType>` — never `any`.

## 5. Git

- Git operations (commit, branch, push, merge) are USER-controlled. Never create commits, branches, or push. After completing work, suggest a commit message only.
- `main` is production (Vercel). All work happens on `feat/*` / `fix/*` branches created by the user.
