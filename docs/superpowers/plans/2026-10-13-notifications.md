# In-app Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user who is dethroned sees a "¡Te destronaron!" toast live and a header bell with an unread count and their recent dethrones.

**Architecture:** The notification is the existing `reigns` row (`dethroned_user_id = me`); the only new state is `notification_seen` (when the user last opened the bell), written by a `SECURITY DEFINER` RPC. A server service reads the last 10 dethrones + `seen_at` and derives `unread`; the header Server Component passes that to a client `NotificationBell`. A Realtime subscription filtered by `dethroned_user_id` (the existing `LiveRefresh`, generalized to take a filter) calls `router.refresh()`, and the bell toasts when a new top item arrives.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, `@supabase/supabase-js` 2.112, Tailwind v4 + `globals.css`, Postgres migration, Vitest 4 with the repo's chainable Supabase mock.

**Spec:** `docs/superpowers/specs/2026-10-13-notifications-design.md`

## Global Constraints

- Notifications are derived from `reigns`; no `notifications` table, no trigger. Seen-state lives in `notification_seen` (owner-only SELECT, no client writes), never as a column on `profiles` (publicly readable).
- `mark_notifications_seen()` uses server time (`now()`), never a client timestamp.
- No new dependencies. No DOM test environment exists, so UI is verified by the local CDP check below + `npm run verify`; logic that can be pure is tested with Vitest.
- AGENTS.md: one short single-line English comment before each exported function; no `any`, no type assertions on Supabase responses; UI copy es-AR; `@/*` imports; no `console.log`; explicit `'es-AR'` locale on any date/number formatting (use `formatDate` / `formatCoronas` from `@/lib/format`).
- Only Next/React APIs already used in this repo (`revalidatePath`, `useRouter().refresh`, `"use server"`); do not hand-edit `src/types/database.types.ts` (regenerate with `npm run update-types`).
- Keep `display` utilities (`flex`, `grid`, `block`) OFF the `popover` element itself (they override the UA `display: none` and the panel would always show); put layout on an inner `<div>`.
- Local SQL uses `PSQL=/opt/homebrew/opt/libpq/bin/psql` and `DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres` — never the remote URL from `.env.local` until Task 6.
- The dev server for checks runs against the **local** stack: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<local ANON_KEY> npx next dev -p 3101` (bypasses the `predev` guard on purpose; `.env.local` points at the shared remote project).
- Git: Claude commits/pushes/opens the PR; Nico merges. No attribution trailers in commits or PR. Branch `feat/notifications` already exists and holds the spec commit.
- Phases: stop after Task 4 (push the branch) and after Task 5 (push the branch) for Nico's go-ahead.

## Review Focus

- A user created after the migration has no `notification_seen` row: every dethrone in the 14-day window must count as unread (not 0, not an error).
- `seen_at` equal to a reign's `started_at` is read (strictly newer = unread); a `seen_at` newer than all items → 0 unread.
- Another user's `notification_seen` row must be invisible, and the table must reject direct client writes; anon must not call `mark_notifications_seen`.
- Display names that are `NULL`/blank fall back to `username`, then `"Anónimo"`; a reign whose title join is missing is skipped, not a crash.
- Initial render and plain navigation must not toast; only a *changed* top item with `unread > 0` does.
- A toast inside the header would be positioned against the `backdrop-blur` nav, not the viewport → it must be portaled to `document.body`.
- A failed mark-as-read must leave the unread state untouched (no layout revalidation, a Spanish error returned).

---

## Setup (once, before Task 1)

- [ ] Docker Desktop running (`open -a Docker`, wait until `docker ps` works). If the *docuauto* stack grabbed the ports: `npx supabase stop --project-id docuauto`.
- [ ] `npx supabase start` (repo root), then `npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)='` and keep `ANON_KEY` for the dev server.
- [ ] `npx supabase migration up --local` (brings local to 0010 if behind).
- [ ] In each shell: `export PSQL=/opt/homebrew/opt/libpq/bin/psql DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres` and `export SUPABASE_DB_URL=$DB` (so `npm run test:sql` works).

### Check scripts (scratchpad, not committed)

`$S` = the session scratchpad directory.

`$S/hold.sql` — `:uid` takes `:slug` at the current minimum (impersonating that user):

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'uid'::text, 'role', 'authenticated')::text, true);
SELECT title_id, price_paid
FROM public.dethrone_with_coins(
  (SELECT id FROM public.titles WHERE slug = :'slug'),
  COALESCE((SELECT current_price FROM public.titles_priced WHERE slug = :'slug') + 1, 1),
  'D9 hold');
COMMIT;
```

`$S/dethrone.sql` — dethrones `:slug` as the richest bot that doesn't hold it, paying the minimum:

```sql
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', b.id, 'role', 'authenticated')::text, true)
FROM public.profiles b
WHERE b.is_bot
  AND b.id IS DISTINCT FROM (SELECT holder_user_id FROM public.titles_priced WHERE slug = :'slug')
ORDER BY public.coin_balance(b.id) DESC
LIMIT 1;
SELECT title_id, price_paid
FROM public.dethrone_with_coins(
  (SELECT id FROM public.titles WHERE slug = :'slug'),
  COALESCE((SELECT current_price FROM public.titles_priced WHERE slug = :'slug') + 1, 1),
  'D9 live check');
COMMIT;
```

`$S/notify-check.mjs` — as a fresh guest in headless Chrome (CDP on 9222): logs in, makes the guest hold a title, loads a page, lets a bot dethrone them, probes with and without a reload, opens the bell, screenshots:

```js
// usage: node notify-check.mjs <path> <shot.png> [mobile]   (env: S=<scratchpad dir>, BASE=http://localhost:3101)
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [path, shot, mobile] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:3101";
const S = process.env.S;
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PSQL = "/opt/homebrew/opt/libpq/bin/psql";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psql = (...args) => execFileSync(PSQL, [DB, "-v", "ON_ERROR_STOP=1", "-qAt", ...args], { encoding: "utf8" }).trim();

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener("message", ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { returnByValue: true, expression })).result.value;
const probe = () =>
  evaluate(`({
    bell: document.querySelector('button[aria-label^="Avisos"]')?.getAttribute("aria-label") ?? null,
    toast: document.querySelector("#notification-toast")?.innerText ?? null,
    open: document.querySelector("#notifications-panel")?.matches(":popover-open") ?? false,
    list: document.querySelector("#notifications-panel")?.innerText ?? null,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  })`);

await send("Page.enable");
if (mobile) await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 2, mobile: true });

// 1. Guest login (button text from guest-login-button.tsx).
await send("Page.navigate", { url: `${BASE}/login` });
await sleep(4000);
await evaluate(`[...document.querySelectorAll("button")].find((b) => b.innerText.includes("ENTRAR COMO INVITADO")).click()`);
await sleep(6000);

// 2. The guest holds a cheap title, then we open the page under test.
const uid = psql("-c", "select id from public.profiles order by created_at desc limit 1");
const slug = psql("-c", "select slug from public.titles_priced where holder_user_id is null or current_price < 10 limit 1");
psql("-v", `uid=${uid}`, "-v", `slug=${slug}`, "-f", `${S}/hold.sql`);
await send("Page.navigate", { url: `${BASE}${path}` });
await sleep(8000); // load + hydrate + realtime join
const start = await probe();

// 3. A bot dethrones the guest.
psql("-v", `slug=${slug}`, "-f", `${S}/dethrone.sql`);
await sleep(4000);
const live = await probe(); // no reload: phase 2 shows the toast + unread here

// 4. Reload, then open the bell.
await send("Page.navigate", { url: `${BASE}${path}` });
await sleep(6000);
const reloaded = await probe();
await evaluate(`document.querySelector('button[aria-label^="Avisos"]').click()`);
await sleep(2500);
const opened = await probe();
await send("Page.navigate", { url: `${BASE}${path}` });
await sleep(5000);
const afterOpen = await probe(); // unread must be gone after opening

console.log(JSON.stringify({ uid, slug, start, live, reloaded, opened, afterOpen }, null, 2));
const { data } = await send("Page.captureScreenshot");
writeFileSync(shot, Buffer.from(data, "base64"));
ws.close();
```

Chrome (background): `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9222 --user-data-dir="$S/chrome" --window-size=1440,1000 about:blank`

Warm each route once with `curl -s -o /dev/null http://localhost:3101/<route>` before probing (first dev compile is slow). Every run of `notify-check.mjs` needs a fresh Chrome profile (`rm -rf "$S/chrome"` and restart Chrome) so the login starts logged out.

---

### Task 1: Migration 0011 + SQL tests (Phase 1)

**Files:**
- Create: `supabase/migrations/0011_notification_seen.sql`
- Create: `supabase/tests/notifications_test.sql`
- Modify: `package.json` (add the test file to `test:sql`)
- Modify: `src/types/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Produces (DB): table `public.notification_seen (user_id uuid PK → profiles ON DELETE CASCADE, seen_at timestamptz NOT NULL)`, owner-only SELECT for `authenticated`; function `public.mark_notifications_seen() RETURNS void`, EXECUTE for `authenticated` only, raises `Not authenticated` without `auth.uid()`.
- Produces (types): `Database["public"]["Tables"]["notification_seen"]` and `Database["public"]["Functions"]["mark_notifications_seen"]` after Step 6.

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/tests/notifications_test.sql`:

```sql
-- supabase/tests/notifications_test.sql
-- Verifies migration 0011: notification_seen is owner-readable and client-read-only,
-- mark_notifications_seen upserts only the caller's row with server time, access rules.
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notifications_test.sql
-- Everything runs in one transaction and ROLLBACKs; safe against any environment.

BEGIN;

-- Fixtures (as postgres): a has a row from an hour ago, b has a row from a day ago, c has none.
-- now() is frozen inside a transaction, so "moves forward" is checked against a backdated row.
INSERT INTO auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
  ('ea111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'notif_a@coronate.test', '{}', '{}', now(), now()),
  ('ea222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'notif_b@coronate.test', '{}', '{}', now(), now()),
  ('ea333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'notif_c@coronate.test', '{}', '{}', now(), now());

INSERT INTO public.notification_seen (user_id, seen_at) VALUES
  ('ea111111-1111-4111-8111-111111111111', now() - interval '1 hour'),
  ('ea222222-2222-4222-8222-222222222222', now() - interval '1 day');

-- Act as a.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"ea111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
DO $$
DECLARE
  ok boolean;
BEGIN
  ASSERT (SELECT count(*) FROM public.notification_seen) = 1, 'a sees only their own row';
  ASSERT (SELECT user_id FROM public.notification_seen) = 'ea111111-1111-4111-8111-111111111111', 'a sees a''s row, not b''s';

  PERFORM public.mark_notifications_seen();
  ASSERT (SELECT seen_at FROM public.notification_seen) = now(), 'a: seen_at moves to the server time';

  ok := false;
  BEGIN
    INSERT INTO public.notification_seen (user_id, seen_at)
      VALUES ('ea111111-1111-4111-8111-111111111111', now());
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not INSERT directly';

  ok := false;
  BEGIN
    UPDATE public.notification_seen SET seen_at = now() + interval '1 year';
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not UPDATE directly';

  ok := false;
  BEGIN
    DELETE FROM public.notification_seen;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'authenticated must not DELETE directly';
END $$;

-- Act as c, who has no row yet: the call creates exactly their row.
SELECT set_config('request.jwt.claims',
  '{"sub":"ea333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.notification_seen) = 0, 'c starts with no row';
  PERFORM public.mark_notifications_seen();
  ASSERT (SELECT user_id FROM public.notification_seen) = 'ea333333-3333-4333-8333-333333333333', 'c: the row is created for c';
END $$;

-- An authenticated role without a user id is rejected.
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_notifications_seen();
  EXCEPTION WHEN OTHERS THEN ok := SQLERRM = 'Not authenticated';
  END;
  ASSERT ok, 'no auth.uid() must raise Not authenticated';
END $$;

-- Back as postgres: b's row is untouched by a's and c's calls.
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT seen_at FROM public.notification_seen WHERE user_id = 'ea222222-2222-4222-8222-222222222222')
    < now() - interval '23 hours', 'b''s row must not change';
END $$;

-- Anonymous clients can neither read the table nor call the RPC.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$
DECLARE
  ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_notifications_seen();
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not call mark_notifications_seen';

  ok := false;
  BEGIN
    PERFORM count(*) FROM public.notification_seen;
  EXCEPTION WHEN insufficient_privilege THEN ok := true;
  END;
  ASSERT ok, 'anon must not read notification_seen';

  RAISE NOTICE 'notifications_test: all assertions passed';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run it to see it fail**

Run: `$PSQL $DB -v ON_ERROR_STOP=1 -f supabase/tests/notifications_test.sql`
Expected: FAIL with `relation "public.notification_seen" does not exist` (migration not written yet).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0011_notification_seen.sql`:

```sql
-- ============================================================================
-- 0011_notification_seen.sql — D9 in-app notifications
--   A dethrone notification IS the reigns row (dethroned_user_id = the victim);
--   the only new state is when each user last opened their bell. It lives in an
--   owner-only table, not on profiles (publicly readable: it would leak when
--   someone was last active).
-- ============================================================================

CREATE TABLE public.notification_seen (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL
);

ALTER TABLE public.notification_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notification state is viewable by its owner"
  ON public.notification_seen FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.notification_seen FROM anon, authenticated;
GRANT SELECT ON public.notification_seen TO authenticated;

-- Existing users start fully read, so launch does not flood anyone with "unread".
INSERT INTO public.notification_seen (user_id, seen_at)
SELECT id, now() FROM public.profiles;

-- ---------------------------------------------------------------------------
-- mark_notifications_seen — the caller has opened their bell (server time, so a
-- client clock cannot hide a notification). A user with no row yet gets one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notifications_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.notification_seen (user_id, seen_at)
  VALUES (auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET seen_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_seen() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_notifications_seen() TO authenticated;
```

- [ ] **Step 4: Apply it locally and run the test**

Run: `npx supabase migration up --local && $PSQL $DB -v ON_ERROR_STOP=1 -f supabase/tests/notifications_test.sql`
Expected: `NOTICE:  notifications_test: all assertions passed` then `ROLLBACK`, no errors.

- [ ] **Step 5: Add the test to `test:sql` and run the whole SQL suite**

In `package.json`, append ` -f supabase/tests/notifications_test.sql` to the end of the `test:sql` command (after `bots_test.sql`).

Run: `npm run test:sql`
Expected: every file prints its `all assertions passed` notice, exit code 0.

- [ ] **Step 6: Regenerate the DB types**

Run: `npm run update-types && git diff --stat src/types/database.types.ts && grep -n "notification_seen\|mark_notifications_seen" src/types/database.types.ts | head`
Expected: the diff adds the `notification_seen` table (Row/Insert/Update/Relationships) and `mark_notifications_seen` under `Functions`; nothing else changes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0011_notification_seen.sql supabase/tests/notifications_test.sql package.json src/types/database.types.ts
git commit -m "feat: notification_seen table and mark_notifications_seen RPC"
```

Test command for the task: `npm run test:sql`

---

### Task 2: `getNotifications` service + `/perfil` switch (Phase 1)

**Files:**
- Create: `src/services/notifications.server.ts`
- Create: `src/services/__tests__/notifications.server.test.ts`
- Modify: `src/test/supabase-mock.ts` (add `gt` to `BUILDER_METHODS`)
- Modify: `src/types/index.ts` (`DethroneNotice` gains `id`, `pricePaid`; new `Notifications`)
- Modify: `src/services/profiles.server.ts` (delete `getLatestDethrone` and its type import)
- Modify: `src/app/perfil/page.tsx` (read the banner from `getNotifications`)

**Interfaces:**
- Consumes: `Database` types from Task 1 (`notification_seen` table), `SupabaseServerClient` from `@/lib/supabase/server`.
- Produces: `getNotifications(supabase: SupabaseServerClient, userId: string): Promise<Notifications>` from `@/services/notifications.server`; types from `@/types`:
  `DethroneNotice = { id: string; titleName: string; titleEmoji: string; titleSlug: string; byName: string; pricePaid: number; message: string | null; at: string }` and `Notifications = { items: DethroneNotice[]; unread: number }`.

- [ ] **Step 1: Add `gt` to the mock's chainable methods**

In `src/test/supabase-mock.ts`, change

```ts
const BUILDER_METHODS = [
  "select", "insert", "update", "delete",
  "eq", "in", "is", "not", "order", "limit",
];
```

to

```ts
const BUILDER_METHODS = [
  "select", "insert", "update", "delete",
  "eq", "in", "is", "not", "gt", "order", "limit",
];
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/__tests__/notifications.server.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getNotifications } from "../notifications.server";
import { createSupabaseMock } from "@/test/supabase-mock";

const T1 = "2026-10-13T10:00:00+00:00";
const T2 = "2026-10-13T11:00:00+00:00";
const T3 = "2026-10-13T12:00:00.5+00:00";

function reignRow(id: string, startedAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    started_at: startedAt,
    price_paid: 12,
    message: null,
    profiles: { username: "fran", display_name: "Fran" },
    titles: { name: "Rey de Córdoba", emoji: "👑", slug: "rey-de-cordoba" },
    ...overrides,
  };
}

function mockWith(rows: unknown[], seenAt: string | null) {
  return createSupabaseMock({
    queryByTable: {
      reigns: { data: rows, error: null },
      notification_seen: { data: seenAt === null ? null : { seen_at: seenAt }, error: null },
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getNotifications", () => {
  it("maps joined reigns to notices, newest first as returned", async () => {
    const supabase = mockWith([reignRow("r2", T2, { message: "jaque" }), reignRow("r1", T1)], null);
    const { items } = await getNotifications(supabase, "u1");
    expect(items).toEqual([
      { id: "r2", titleName: "Rey de Córdoba", titleEmoji: "👑", titleSlug: "rey-de-cordoba", byName: "Fran", pricePaid: 12, message: "jaque", at: T2 },
      { id: "r1", titleName: "Rey de Córdoba", titleEmoji: "👑", titleSlug: "rey-de-cordoba", byName: "Fran", pricePaid: 12, message: null, at: T1 },
    ]);
  });

  it("falls back to the username, then to Anónimo, for the dethroner's name", async () => {
    const supabase = mockWith(
      [
        reignRow("r3", T3, { profiles: { username: "fran", display_name: "  " } }),
        reignRow("r2", T2, { profiles: { username: "fran", display_name: null } }),
        reignRow("r1", T1, { profiles: null }),
      ],
      null,
    );
    const { items } = await getNotifications(supabase, "u1");
    expect(items.map((i) => i.byName)).toEqual(["fran", "fran", "Anónimo"]);
  });

  it("skips a reign whose title join is missing", async () => {
    const supabase = mockWith([reignRow("r2", T2, { titles: null }), reignRow("r1", T1)], null);
    const { items } = await getNotifications(supabase, "u1");
    expect(items.map((i) => i.id)).toEqual(["r1"]);
  });

  it("counts only items strictly newer than seen_at as unread", async () => {
    const supabase = mockWith([reignRow("r3", T3), reignRow("r2", T2), reignRow("r1", T1)], T2);
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 1 });
  });

  it("treats everything as unread when the user has no notification_seen row", async () => {
    const supabase = mockWith([reignRow("r2", T2), reignRow("r1", T1)], null);
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 2 });
  });

  it("has nothing unread when seen_at is newer than every item", async () => {
    const supabase = mockWith([reignRow("r2", T2), reignRow("r1", T1)], "2026-10-13T20:00:00+00:00");
    await expect(getNotifications(supabase, "u1")).resolves.toMatchObject({ unread: 0 });
  });

  it("returns an empty inbox when nobody dethroned the user", async () => {
    const supabase = mockWith([], null);
    await expect(getNotifications(supabase, "u1")).resolves.toEqual({ items: [], unread: 0 });
  });

  it("queries the user's dethrones of the last 14 days, newest first, capped at 10", async () => {
    const supabase = mockWith([], null);
    await getNotifications(supabase, "u1");
    const reigns = supabase.from("reigns").select();
    expect(reigns.eq).toHaveBeenCalledWith("dethroned_user_id", "u1");
    expect(reigns.gt).toHaveBeenCalledWith("started_at", "2026-09-30T00:00:00.000Z");
    expect(reigns.order).toHaveBeenCalledWith("started_at", { ascending: false });
    expect(reigns.limit).toHaveBeenCalledWith(10);
    expect(supabase.from("notification_seen").select().eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("throws when the reigns query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        reigns: { data: null, error: { message: "boom" } },
        notification_seen: { data: null, error: null },
      },
    });
    await expect(getNotifications(supabase, "u1")).rejects.toMatchObject({ message: "boom" });
  });

  it("throws when the seen-state query fails", async () => {
    const supabase = createSupabaseMock({
      queryByTable: {
        reigns: { data: [], error: null },
        notification_seen: { data: null, error: { message: "seen boom" } },
      },
    });
    await expect(getNotifications(supabase, "u1")).rejects.toMatchObject({ message: "seen boom" });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/services/__tests__/notifications.server.test.ts`
Expected: FAIL — `Failed to resolve import "../notifications.server"` (module does not exist yet).

- [ ] **Step 4: Update the types**

In `src/types/index.ts`, replace the existing `DethroneNotice` block:

```ts
// A notice shown when a user was dethroned in the last 14 days.
export type DethroneNotice = {
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  byName: string;
  message: string | null;
  at: string;
};
```

with:

```ts
// One time the user was dethroned: a bell item, a toast and the /perfil banner.
export type DethroneNotice = {
  id: string;
  titleName: string;
  titleEmoji: string;
  titleSlug: string;
  byName: string;
  pricePaid: number;
  message: string | null;
  at: string;
};

// The user's recent dethrones (newest first) and how many are newer than their last bell opening.
export type Notifications = { items: DethroneNotice[]; unread: number };
```

- [ ] **Step 5: Write the service**

Create `src/services/notifications.server.ts`:

```ts
import { type QueryData } from "@supabase/supabase-js";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { DethroneNotice, Notifications } from "@/types";

const WINDOW_DAYS = 14;
const LIMIT = 10;

const dethronesQuery = (supabase: SupabaseServerClient, userId: string, since: string) =>
  supabase
    .from("reigns")
    .select(
      "id, started_at, price_paid, message, profiles!reigns_user_id_fkey ( username, display_name ), titles ( name, emoji, slug )",
    )
    .eq("dethroned_user_id", userId)
    .gt("started_at", since)
    .order("started_at", { ascending: false })
    .limit(LIMIT);
type DethroneRow = QueryData<ReturnType<typeof dethronesQuery>>[number];

// Flattens joined reigns into notices; a row without its title join is dropped.
function toNotices(rows: DethroneRow[]): DethroneNotice[] {
  return rows.flatMap((row) => {
    if (!row.titles) return [];
    return [
      {
        id: row.id,
        titleName: row.titles.name,
        titleEmoji: row.titles.emoji,
        titleSlug: row.titles.slug,
        byName: row.profiles?.display_name?.trim() || row.profiles?.username || "Anónimo",
        pricePaid: row.price_paid,
        message: row.message,
        at: row.started_at,
      },
    ];
  });
}

// Returns the user's dethrones of the last 14 days (newest first, max 10) and how many are newer than their last bell opening.
export async function getNotifications(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<Notifications> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const [reigns, seen] = await Promise.all([
    dethronesQuery(supabase, userId, since),
    supabase.from("notification_seen").select("seen_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (reigns.error) throw reigns.error;
  if (seen.error) throw seen.error;

  const items = toNotices(reigns.data);
  // ponytail: Date.parse is millisecond precision; a reign inside the same ms as seen_at reads as seen. Compare in SQL if that ever matters.
  const seenAt = seen.data ? Date.parse(seen.data.seen_at) : null;
  const unread =
    seenAt === null ? items.length : items.filter((item) => Date.parse(item.at) > seenAt).length;
  return { items, unread };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/services/__tests__/notifications.server.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 7: Move `/perfil` to the new service and delete the old query**

In `src/services/profiles.server.ts`: delete the whole `getLatestDethrone` function (the block starting with the comment `// Returns the latest dethrone notice for a user (last 14 days), or null if none.`) and change line 3 to
`import type { Profile, ProfileReign, PublicProfile, SocialKey } from "@/types";`.

In `src/app/perfil/page.tsx`: replace `import { getLatestDethrone } from "@/services/profiles.server";` with `import { getNotifications } from "@/services/notifications.server";`, then replace

```ts
  const [dethroneNotice, balance, salary, movements] = await Promise.all([
    getLatestDethrone(supabase, user.id),
```

with

```ts
  const [notifications, balance, salary, movements] = await Promise.all([
    getNotifications(supabase, user.id),
```

and add right after that `Promise.all` statement (before `return`):

```ts
  const dethroneNotice = notifications.items[0] ?? null;
```

(`/perfil` now reads this once for the banner and the header reads it again for the bell; two small queries on one page, accepted.)

- [ ] **Step 8: Typecheck, lint, whole unit suite**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass (lint may show the one pre-existing custom-font warning; nothing new). If lint flags an unused import in `profiles.server.ts`, remove it.

- [ ] **Step 9: Commit**

```bash
git add src/services/notifications.server.ts src/services/__tests__/notifications.server.test.ts src/test/supabase-mock.ts src/types/index.ts src/services/profiles.server.ts src/app/perfil/page.tsx
git commit -m "feat: getNotifications service derives dethrone notices and unread count"
```

Test command for the task: `npx vitest run src/services/__tests__/notifications.server.test.ts`

---

### Task 3: `markNotificationsSeen` service + `marcarNotificacionesLeidas` action (Phase 1)

**Files:**
- Modify: `src/services/notifications.server.ts` (add `markNotificationsSeen`)
- Modify: `src/services/__tests__/notifications.server.test.ts` (add its tests)
- Create: `src/actions/notifications.ts`
- Create: `src/actions/__tests__/notifications.test.ts`

**Interfaces:**
- Consumes: `mark_notifications_seen` RPC (Task 1); `errorMessage` from `@/lib/errors`; `ActionResult` from `@/types`.
- Produces: `markNotificationsSeen(supabase: SupabaseServerClient): Promise<void>` (throws the Supabase error); server action `marcarNotificacionesLeidas(): Promise<ActionResult<null>>` from `@/actions/notifications`.

- [ ] **Step 1: Write the failing service tests**

In `src/services/__tests__/notifications.server.test.ts` change the import line to
`import { getNotifications, markNotificationsSeen } from "../notifications.server";`
and append:

```ts
describe("markNotificationsSeen", () => {
  it("calls the mark_notifications_seen RPC", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: null } });
    await expect(markNotificationsSeen(supabase)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_seen");
  });

  it("throws when the RPC fails", async () => {
    const supabase = createSupabaseMock({ rpc: { data: null, error: { message: "boom" } } });
    await expect(markNotificationsSeen(supabase)).rejects.toMatchObject({ message: "boom" });
  });
});
```

- [ ] **Step 2: Write the failing action tests**

Create `src/actions/__tests__/notifications.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabase-mock";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { marcarNotificacionesLeidas } from "../notifications";

beforeEach(() => {
  createClientMock.mockReset();
  revalidatePathMock.mockReset();
});

describe("marcarNotificacionesLeidas", () => {
  it("returns an error when the user is not authenticated", async () => {
    const supabase = createSupabaseMock({ user: null });
    createClientMock.mockResolvedValue(supabase);
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({
      success: false,
      error: "Tenés que iniciar sesión para ver tus avisos.",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["Not authenticated", "Tenés que iniciar sesión para ver tus avisos."],
    ["boom", "No se pudieron marcar los avisos como leídos. Probá de nuevo."],
  ])("maps the RPC error %j to a Spanish message", async (rpcMessage, expected) => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: { message: rpcMessage } } }),
    );
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({ success: false, error: expected });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("marks them seen and revalidates the whole layout so the bell clears", async () => {
    const supabase = createSupabaseMock({ user: { id: "u1" }, rpc: { data: null, error: null } });
    createClientMock.mockResolvedValue(supabase);
    await expect(marcarNotificacionesLeidas()).resolves.toEqual({ success: true, data: null });
    expect(supabase.rpc).toHaveBeenCalledWith("mark_notifications_seen");
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/services/__tests__/notifications.server.test.ts src/actions/__tests__/notifications.test.ts`
Expected: FAIL — service tests: `markNotificationsSeen is not a function`; action tests: cannot resolve `../notifications`.

- [ ] **Step 4: Add the service function**

Append to `src/services/notifications.server.ts`:

```ts
// Records that the signed-in user has opened their bell (server time, set by the RPC).
export async function markNotificationsSeen(supabase: SupabaseServerClient): Promise<void> {
  const { error } = await supabase.rpc("mark_notifications_seen");
  if (error) throw error;
}
```

- [ ] **Step 5: Write the action**

Create `src/actions/notifications.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { markNotificationsSeen } from "@/services/notifications.server";
import type { ActionResult } from "@/types";

const NOT_AUTH = "Tenés que iniciar sesión para ver tus avisos.";

// Marks the signed-in user's notifications as read; the layout revalidation clears the bell's unread count.
export async function marcarNotificacionesLeidas(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: NOT_AUTH };

  try {
    await markNotificationsSeen(supabase);
  } catch (err: unknown) {
    if (errorMessage(err).includes("Not authenticated")) return { success: false, error: NOT_AUTH };
    return { success: false, error: "No se pudieron marcar los avisos como leídos. Probá de nuevo." };
  }

  revalidatePath("/", "layout");
  return { success: true, data: null };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/services/__tests__/notifications.server.test.ts src/actions/__tests__/notifications.test.ts`
Expected: PASS (service 12 tests, action 4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/services/notifications.server.ts src/services/__tests__/notifications.server.test.ts src/actions/notifications.ts src/actions/__tests__/notifications.test.ts
git commit -m "feat: marcarNotificacionesLeidas action"
```

Test command for the task: `npx vitest run src/services/__tests__/notifications.server.test.ts src/actions/__tests__/notifications.test.ts`

---

### Task 4: `NotificationBell` with list, unread and mark-read (Phase 1 — then STOP)

**Files:**
- Create: `src/components/notification-bell.tsx`
- Modify: `src/components/site-header.tsx` (fetch notifications, mount the bell; 360 px fix if needed)

**Interfaces:**
- Consumes: `getNotifications` (Task 2), `marcarNotificacionesLeidas` (Task 3), `Notifications` type, `formatCoronas` / `formatDate` from `@/lib/format`.
- Produces: `NotificationBell({ initialData }: { initialData: Notifications }): JSX.Element` from `@/components/notification-bell`. DOM contract used by the smoke script: button `aria-label` starts with `Avisos` (`Avisos` or `Avisos: N sin leer`), panel id `notifications-panel`.

- [ ] **Step 1: Show the bell does not exist yet (failing check)**

Start the dev server and Chrome (see Global Constraints and the Chrome command above), warm `/`, then:
Run: `S=$S node $S/notify-check.mjs / $S/bell-before.png`
Expected: in every probe `bell` is `null` (no bell in the header yet) — this is the RED state.

- [ ] **Step 2: Write the component**

Create `src/components/notification-bell.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTransition } from "react";
import { marcarNotificacionesLeidas } from "@/actions/notifications";
import { formatCoronas, formatDate } from "@/lib/format";
import type { Notifications } from "@/types";

// Header bell: unread badge plus a popover with the user's recent dethrones; opening it marks them read.
export function NotificationBell({ initialData }: { initialData: Notifications }) {
  const { items, unread } = initialData;
  const [, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        popoverTarget="notifications-panel"
        aria-label={unread > 0 ? `Avisos: ${unread} sin leer` : "Avisos"}
        className="relative p-2 text-on-surface-variant hover:text-primary transition-colors"
      >
        <span aria-hidden="true" className="material-symbols-outlined">notifications</span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-tertiary text-surface-container-lowest text-[10px] leading-4 font-bold text-center"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* No display utilities on the popover itself: they would override its closed state. */}
      <div
        id="notifications-panel"
        popover="auto"
        onToggle={(event) => {
          if (event.newState !== "open" || unread === 0) return;
          startTransition(async () => {
            await marcarNotificacionesLeidas();
          });
        }}
        className="fixed inset-auto top-[5.25rem] right-4 md:right-16 m-0 p-0 w-[min(22rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-container text-on-surface shadow-xl"
      >
        <div className="flex flex-col">
          <h2 className="px-4 py-3 text-label-caps font-label-caps text-on-surface-variant border-b border-outline-variant/30">
            Avisos
          </h2>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-body-sm font-body-sm text-on-surface-variant">
              Nadie te destronó todavía.
            </p>
          ) : (
            <ul>
              {items.map((item) => (
                <li key={item.id} className="border-b border-outline-variant/20 last:border-b-0">
                  <Link
                    href={`/t/${item.titleSlug}`}
                    className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-container-high transition-colors"
                  >
                    <span className="text-body-sm font-body-sm text-on-surface">
                      {item.byName} te destronó en {item.titleEmoji} {item.titleName}
                    </span>
                    <span className="text-label-caps font-label-caps text-tertiary">
                      Te pagó {formatCoronas(item.pricePaid)} · {formatDate(item.at)}
                    </span>
                    {item.message && (
                      <span className="text-body-sm font-body-sm text-on-surface-variant">
                        «{item.message}»
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Mount it in the header**

In `src/components/site-header.tsx`:

1. Add imports: `import { getNotifications } from "@/services/notifications.server";`, `import { NotificationBell } from "@/components/notification-bell";` and `import type { Notifications } from "@/types";`.
2. Add `let notifications: Notifications | null = null;` next to `let salaryReady = false;`.
3. Extend the `Promise.all`:

```ts
    const [profile, coins, salary, inbox] = await Promise.all([
      getOwnProfile(supabase, user.id),
      getBalance(supabase, user.id).catch(() => null),
      getSalaryStatus(supabase).catch(() => null),
      getNotifications(supabase, user.id).catch(() => null),
    ]);
```

and after `salaryReady = ...;` add `notifications = inbox;`. Update the comment above to mention the bell: `// A failed balance, salary or notifications read hides the chip, its dot or the bell instead of breaking every page.`
4. Render the bell between the balance chip block and the `@username` link: `{notifications !== null && <NotificationBell initialData={notifications} />}`.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors. If `event.newState` fails to type-check, `ToggleEvent` is declared at `node_modules/@types/react/index.d.ts:2216` — check that `onToggle` on a `div` is typed with it; do not cast, adjust the handler parameter type instead.

- [ ] **Step 5: Run the smoke check (desktop) and read it**

Fresh Chrome profile, then: `S=$S node $S/notify-check.mjs / $S/bell-desktop.png`
Expected in the JSON:
- `start.bell` = `"Avisos"` (guest holds a title, nothing unread), `start.toast` = `null`.
- `live.bell` = `"Avisos"` (no Realtime yet in this phase) and `live.toast` = `null`.
- `reloaded.bell` = `"Avisos: 1 sin leer"`.
- `opened.open` = `true` and `opened.list` contains `te destronó en` and `Te pagó`.
- `afterOpen.bell` = `"Avisos"` (opening cleared it).
- `overflowX` = `0` in every probe.
Open `bell-desktop.png` and confirm the badge and header look right.

- [ ] **Step 6: Run the 360 px check and fix overflow if any**

Fresh Chrome profile, then: `S=$S node $S/notify-check.mjs / $S/bell-360.png mobile`
Expected: `overflowX` = `0` in every probe and the screenshot shows logo, bell, balance chip and logout without clipping. If `overflowX > 0` or anything is clipped: in `site-header.tsx` the explore icon link (`className="md:hidden p-2 text-on-surface-variant …"`) becomes `className={`${username ? "hidden" : "md:hidden"} p-2 text-on-surface-variant hover:text-primary transition-colors`}` — signed-in users on mobile still reach `/titulos` from the home page and the footer. Re-run until clean.

- [ ] **Step 7: Verify, commit and push the phase**

Run: `npm run verify`
Expected: `All checks passed.`

```bash
git add src/components/notification-bell.tsx src/components/site-header.tsx
git commit -m "feat: notification bell with unread count and recent dethrones"
git push -u origin feat/notifications
```

Test command for the task: `npm run test`

**STOP here.** Report Phase 1 to Nico (screenshots: desktop + 360 px) and wait for the go-ahead.

---

### Task 5: Live delivery and toast (Phase 2 — then STOP)

**Files:**
- Modify: `src/components/live-refresh.tsx` (`titleId` prop → generic `filter`)
- Modify: `src/app/t/[slug]/page.tsx:51` (pass the filter)
- Modify: `src/components/site-header.tsx` (mount a `LiveRefresh` filtered to the viewer)
- Modify: `src/components/notification-bell.tsx` (toast)
- Modify: `src/app/globals.css` (toast animation + reduced-motion)

**Interfaces:**
- Consumes: `NotificationBell` (Task 4).
- Produces: `LiveRefresh({ filter }: { filter?: string }): null` — `filter` is a Realtime `postgres_changes` filter string such as `title_id=eq.<id>` or `dethroned_user_id=eq.<id>`; omitted = every reign. DOM contract: toast element id `notification-toast`, `role="status"`.

- [ ] **Step 1: Run the smoke check and see the live part fail**

Fresh Chrome profile, then: `S=$S node $S/notify-check.mjs / $S/toast-before.png`
Expected (RED): `live.toast` = `null` and `live.bell` = `"Avisos"` — without a reload nothing reflects the dethrone yet.

- [ ] **Step 2: Generalize `LiveRefresh` to take a filter**

In `src/components/live-refresh.tsx` replace the comment, signature, topic, filter and dependency list:

```tsx
// Re-renders the current route whenever a reign starts (only those matching `filter`, e.g. "title_id=eq.<id>", when set).
export function LiveRefresh({ filter }: { filter?: string }) {
```

```tsx
      .channel(`reigns:${filter ?? "all"}:${++channelSeq}`)
```

```tsx
          ...(filter ? { filter } : {}),
```

```tsx
  }, [router, filter]);
```

(everything else stays identical). In `src/app/t/[slug]/page.tsx` line 51 change `<LiveRefresh titleId={title.id} />` to ``<LiveRefresh filter={`title_id=eq.${title.id}`} />``.

- [ ] **Step 3: Mount the viewer-filtered subscription in the header**

In `src/components/site-header.tsx`: add `import { LiveRefresh } from "@/components/live-refresh";`, and render, right before `<NotificationBell …>`:

```tsx
            {user && <LiveRefresh filter={`dethroned_user_id=eq.${user.id}`} />}
```

(`user` is in scope; the layout persists across navigation, so this one channel serves every page and also refreshes the balance chip and an open `/t/[slug]` when the viewer is paid. It is independent of the notifications read, so a failed read still gets live balance refreshes.)

- [ ] **Step 4: Add the toast to the bell**

In `src/components/notification-bell.tsx`:

1. Change the imports to
```tsx
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { marcarNotificacionesLeidas } from "@/actions/notifications";
import { formatCoronas, formatDate } from "@/lib/format";
import type { DethroneNotice, Notifications } from "@/types";

const TOAST_MS = 6000;
```
2. In the component, after `const [, startTransition] = useTransition();` add:

```tsx
  const top = items[0] ?? null;
  const [lastTopId, setLastTopId] = useState(top?.id ?? null);
  const [toast, setToast] = useState<DethroneNotice | null>(null);

  // A different top item with unread dethrones is a fresh one: toast it (the first render only records the baseline).
  if ((top?.id ?? null) !== lastTopId) {
    setLastTopId(top?.id ?? null);
    if (top !== null && unread > 0) setToast(top);
  }

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
```
3. Just before the closing `</>`, add the portaled toast (portaled because the header's `backdrop-blur` would otherwise anchor `position: fixed` to the nav):

```tsx
      {toast !== null &&
        createPortal(
          <div
            id="notification-toast"
            role="status"
            className="toast-in fixed z-[60] bottom-4 left-4 right-4 md:left-auto md:right-8 md:w-96 glass-panel rounded-xl p-4 flex items-start gap-3 border-l-4 border-l-error"
          >
            <Link
              href={`/t/${toast.titleSlug}`}
              onClick={() => setToast(null)}
              className="flex-1 flex flex-col gap-1"
            >
              <span className="text-title-md font-title-md text-on-surface">¡Te destronaron!</span>
              <span className="text-body-sm font-body-sm text-on-surface-variant">
                {toast.byName} te sacó {toast.titleEmoji} {toast.titleName} y te pagó{" "}
                {formatCoronas(toast.pricePaid)}
              </span>
            </Link>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setToast(null)}
              className="p-1 text-on-surface-variant hover:text-primary transition-colors"
            >
              <span aria-hidden="true" className="material-symbols-outlined">close</span>
            </button>
          </div>,
          document.body,
        )}
```

- [ ] **Step 5: Add the animation and its reduced-motion rule**

In `src/app/globals.css`, after the `@keyframes live-flash { … }` block add:

```css
/* ── Toast (a notification arrives) ── */
.toast-in {
  animation: toast-in 0.25s ease-out;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(0.75rem);
  }
}
```

and add `.toast-in,` to the selector list inside the existing `@media (prefers-reduced-motion: reduce)` block (next to `.live-flash,`).

- [ ] **Step 6: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors (the pre-existing font-link warning only).

- [ ] **Step 7: Re-run the smoke check (desktop) and read it**

Fresh Chrome profile, then: `S=$S node $S/notify-check.mjs / $S/toast-desktop.png`
Expected in the JSON:
- `start.toast` = `null` and `start.bell` = `"Avisos"` (no toast on load).
- `live.toast` contains `¡Te destronaron!` and `te sacó` (no reload) and `live.bell` = `"Avisos: 1 sin leer"`.
- `reloaded.toast` = `null` (a plain reload does not toast again) and `reloaded.bell` = `"Avisos: 1 sin leer"`.
- `opened.open` = `true`; `afterOpen.bell` = `"Avisos"`.
Also run it against a title page: `S=$S node $S/notify-check.mjs /t/<slug> $S/toast-title.png` (with `<slug>` = the `slug` field the previous run printed) and confirm `live.toast` is set while the page's own holder text changed (the D8 gap is closed). Open the screenshots and check the toast sits bottom-right, clear of the header.

- [ ] **Step 8: 360 px check**

Fresh Chrome profile, then: `S=$S node $S/notify-check.mjs / $S/toast-360.png mobile`
Expected: `overflowX` = `0` in every probe; the screenshot shows the toast spanning the bottom with 16 px gutters.

- [ ] **Step 9: Verify, commit and push the phase**

Run: `npm run verify`
Expected: `All checks passed.`

```bash
git add src/components/live-refresh.tsx "src/app/t/[slug]/page.tsx" src/components/site-header.tsx src/components/notification-bell.tsx src/app/globals.css
git commit -m "feat: live toast when someone dethrones you"
git push
```

Test command for the task: `npm run test`

**STOP here.** Report Phase 2 (screenshots) to Nico and wait for the go-ahead.

---

### Task 6: Docs, PR and rollout

**Files:**
- Modify: `docs/ROADMAP.md` (D9 checked)
- Modify: `docs/DESIGN.md` (out-of-scope lines 115–116)

**Interfaces:**
- Consumes: everything above. Produces: PR + migration `0011` applied to the shared Supabase project.

- [ ] **Step 1: Update the docs**

In `docs/ROADMAP.md` change the D9 line to
`- [x] **D9** — Notificaciones in-app (derivadas de `reigns` + `notification_seen`) + campanita + toast "¡Te destronaron!"`.

In `docs/DESIGN.md` replace the two out-of-scope bullets
`- Realtime beyond the live ticker/prices (shipped in D8) — e.g. map pulses (D15), notifications (D9)`
`- Notifications (email/push "te destronaron") — dethroned users see it on-site`
with
`- Realtime beyond the live ticker/prices and the dethrone toast (shipped in D8/D9) — e.g. map pulses (D15)`
`- Email / push notifications ("te destronaron") — dethroned users see it in-app (bell + live toast, D9)`.

- [ ] **Step 2: Full verification**

Run: `npm run verify && npm run test:sql`
Expected: `All checks passed.` and every SQL file prints its passed notice.

- [ ] **Step 3: Commit, push and open the PR**

```bash
git add docs/ROADMAP.md docs/DESIGN.md
git commit -m "docs: mark D9 notifications done"
git push
gh pr create --title "feat: in-app notifications (D9)" --body "$(cat <<'EOF'
## Summary
- Dethrone notifications are derived from `reigns` (`dethroned_user_id = me`); no notifications table or trigger.
- Migration 0011: owner-only `notification_seen` table + `mark_notifications_seen()` RPC (server time, authenticated only).
- `getNotifications` service (last 10 dethrones in 14 days + unread count) replaces `getLatestDethrone`; `/perfil` banner reads its first item.
- Header bell with unread badge and a popover list; opening it marks everything read.
- `LiveRefresh` now takes a Realtime `filter`; the header subscribes to `dethroned_user_id=eq.<viewer>`, so a dethrone refreshes the page (balance, open title) and shows a "¡Te destronaron!" toast.

## Test plan
- [x] `npm run verify`
- [x] `npm run test:sql` (new `notifications_test.sql`)
- [x] Local CDP check: guest dethroned by a bot sees the toast + unread without reload; opening the bell clears it; no overflow at 360 px
EOF
)"
gh pr checks --watch
```

Expected: PR opened, CI green. No attribution lines in the commit messages or the PR body.

- [ ] **Step 4: Push the migration to the shared project**

```bash
set -a && . ./.env.local && set +a
npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run
```
Expected: lists only `0011_notification_seen.sql`. If it lists anything else, STOP and investigate before pushing. Then:

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
```
Expected: `0011` applied. (Additive only — old code ignores the new table and function, so pushing before the merge is safe.)

- [ ] **Step 5: Hand over**

Tell Nico: PR link, CI result, that `0011` is already applied to prod, and to merge with "Create a merge commit". After the merge: Vercel deploy READY, then ask Nico to dethrone a bot's title from a second account (or wait for a bot move) to see the toast on prod. Cleanup after the merge: `git switch main && git pull && git branch -d feat/notifications`.
