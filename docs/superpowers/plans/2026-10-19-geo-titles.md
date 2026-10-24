# Geographic Titles (D12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 24 playable province crowns with a PostGIS location, and a `/mapa` where hovering a province shows its top 3 longest reigns and clicking opens a panel with the crown and the top 10.

**Architecture:**
- Migration `0012` adds `provinces`, geo columns on `titles`, the 24 crowns, two appended columns on `titles_priced` and a `province_leaderboard()` SQL function.
- `services/map.server.ts` folds the crowns and the leaderboard into `ProvinceSummary[]`. `/mapa` passes it as `initialData` to the client map.
- Hover and click read from memory. The selection lives in `?provincia=<slug>`.

**Tech Stack:** Supabase Postgres + PostGIS, Next.js 16 App Router, MapLibre GL v6, Vitest, psql SQL tests.

**Spec:** `docs/superpowers/specs/2026-10-19-geo-titles-design.md`

## Global Constraints

- AGENTS.md rules apply:
  - no `any`, no `as` on Supabase responses (types come from `QueryData` / generated `Database`);
  - one single-line English comment before each exported function;
  - es-AR copy;
  - `formatCoronas` / explicit `'es-AR'` locale.
- The migration is **additive**: prod runs old code against the new schema until Nico merges.
- Inserts are idempotent: `ON CONFLICT (slug) DO UPDATE` for the crowns, so that `supabase db reset` (migrations, then `seed.sql`) keeps Córdoba's geo columns.
- Ranking = active + ended reigns of every geographic title in the province, ordered by `COALESCE(ended_at, now()) - started_at` DESC, ties by `started_at`. Top 10 per province; the hover card shows the first 3.
- Duration labels are computed **on the server** (`formatReignDuration`) and passed as strings. No `Date.now()` in client render, so a panel SSR'd from `?provincia=` hydrates cleanly.
- CTA: held → `DESTRONAR · {formatCoronas(price + 1)}`, free → `CORONARME · {formatCoronas(1)}`, both linking to `/t/[slug]`.
- Work in phases: stop after Task 2 for Nico's go-ahead, then do Tasks 3–4.

## Review Focus

1. **Tap on a touch screen** fires compatibility mouse events. Expected: only the panel opens; the hover card never shows on `(hover: none)` devices. *(Task 3, CDP touch check)*
2. **`?provincia=` garbage** (unknown slug, empty, repeated param). Expected: no panel and no error; the map renders normally. *(Task 3, CDP check)*
3. **Province with no reigns** (all 23 new crowns in prod on day one). Expected:
   - hover: "Trono vacío · Coronate desde 1 👑";
   - panel: CORONARME CTA;
   - no empty ranking header. *(Task 2 unit test + Task 3 check)*
4. **Active reign durations** must not cause a hydration mismatch when the panel is server-rendered from the URL. *(Task 2: labels are strings from the service; Task 3: load `/mapa?provincia=cordoba` and check the console for hydration errors)*
5. **Fresh local DB** (`db reset` = migrations then seed). Expected: Córdoba still has its crown with geo columns after `seed.sql` inserts `rey-de-cordoba`. *(Task 1 SQL test runs on a reset DB)*

---

### Task 1: Migration 0012 — provinces, geo columns, crowns, leaderboard

**Files:**
- Create: `supabase/migrations/0012_geo_titles.sql`
- Create: `supabase/tests/geo_titles_test.sql`
- Modify: `package.json` (`test:sql`: append `-f supabase/tests/geo_titles_test.sql`)
- Modify: `src/types/database.types.ts` (regenerated, never by hand)
- Commit also: the spec and this plan

**Interfaces:**
- Produces:
  - `public.provinces(code text PK, slug text UNIQUE, name text)`
  - `titles.level`, `titles.province_code`, `titles.location`
  - `titles_priced` gains `level`, `province_code` as its last two columns
  - `public.province_leaderboard(p_limit int DEFAULT 10) RETURNS TABLE (province_code text, rank bigint, reign_id uuid, title_slug text, title_name text, title_emoji text, holder_username text, holder_display_name text, holder_is_bot boolean, price_paid int, started_at timestamptz, ended_at timestamptz)`, ordered by `province_code, rank`

**Setup:** Docker running. `npx supabase stop --project-id docuauto` if its stack holds the ports, then `npx supabase start`. psql is at `/opt/homebrew/opt/libpq/bin/psql`. Branch first: `git switch -c feat/geo-titles`.

- [ ] **Step 1: Write the failing SQL test** `supabase/tests/geo_titles_test.sql`. Follow `notifications_test.sql`: `BEGIN` … `ROLLBACK`, fixtures as postgres, assertions in `DO $$ … ASSERT … $$`. It asserts:
  - `(SELECT count(*) FROM titles WHERE level = 'provincia') = 24`, and every province has exactly one crown.
  - `rey-de-cordoba` has `level = 'provincia'`, `province_code = '14'` and a non-null location. This proves the seed ordering survives a reset.
  - Fixtures: two users. In province `'50'` (Mendoza), add one extra title with `level = 'ciudad'`. Reigns:
    - user A on the Mendoza crown: 10 days, ended;
    - user B on the city title: 3 days, active;
    - user A on the city title: 30 days, ended.
  - On top of that fixture: `province_leaderboard(10)` for `'50'` returns 3 rows, ranks 1..3 in the order 30 d, 10 d, 3 d, with the active row having `ended_at IS NULL`.
  - `province_leaderboard(2)` returns 2 rows for `'50'`.
  - A reign on a non-geographic title (`rey-de-la-pizza`) never appears.
  - Inserting a title with `level` set but `location` NULL raises `check_violation`. A second `level = 'provincia'` title for `'50'` raises `unique_violation`.
  - As `anon` (`SET LOCAL ROLE anon`): `province_leaderboard()` and `SELECT` on `provinces` both work; `INSERT` into `provinces` raises `insufficient_privilege`.

- [ ] **Step 2: Run it and see it fail**
  Run: `PATH=/opt/homebrew/opt/libpq/bin:$PATH psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/geo_titles_test.sql`
  Expected: ERROR, column `level` does not exist.

- [ ] **Step 3: Write `0012_geo_titles.sql`**, in this order:
  1. `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;`
  2. `provinces` with `CHECK (code ~ '^[0-9]{2}$')`. RLS on; policy `FOR SELECT USING (true)`; `GRANT SELECT … TO anon, authenticated`; `REVOKE INSERT, UPDATE, DELETE … FROM anon, authenticated`.
  3. The `titles` columns from the spec (§4).
     - `location extensions.geography(Point, 4326)`.
     - CHECK `titles_geo_all_or_nothing`: `(level IS NULL) = (province_code IS NULL) AND (level IS NULL) = (location IS NULL)`.
     - Index: `CREATE UNIQUE INDEX titles_one_crown_per_province ON titles (province_code) WHERE level = 'provincia'`.
  4. `INSERT INTO provinces` with the 24 rows below.
  5. One `INSERT INTO titles (slug, name, emoji, description, level, province_code, location)` with the 24 crowns, `level = 'provincia'`, `location = extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography`.
     - `ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description, level = EXCLUDED.level, province_code = EXCLUDED.province_code, location = EXCLUDED.location`.
     - Name and emoji of an existing row are kept.
     - Córdoba's new description is about the province.
     - Emoji and description per crown: the builder's (playful es-AR, one sentence, about as long as `seed.sql`'s descriptions).
  6. `CREATE OR REPLACE VIEW public.titles_priced`: copy the 0009 definition verbatim and append `, t.level, t.province_code` after `p.is_bot AS holder_is_bot`. Appending at the end is what `CREATE OR REPLACE VIEW` allows.
  7. `province_leaderboard`: `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''`.
     - Inner query: `reigns ⋈ titles ⋈ profiles` (`reigns.user_id` is NOT NULL) WHERE `t.province_code IS NOT NULL`, with `row_number() OVER (PARTITION BY t.province_code ORDER BY COALESCE(r.ended_at, now()) - r.started_at DESC, r.started_at)`.
     - Outer: `WHERE rank <= p_limit ORDER BY province_code, rank`.
     - `GRANT EXECUTE … TO anon, authenticated`.

  | code | slug | name | crown slug | crown name | lon | lat |
  |---|---|---|---|---|---|---|
  | 02 | caba | Ciudad de Buenos Aires | rey-de-caba | Rey de CABA | -58.447 | -34.607 |
  | 06 | buenos-aires | Buenos Aires | rey-de-buenos-aires | Rey de la Provincia de Buenos Aires | -60.278 | -36.394 |
  | 10 | catamarca | Catamarca | rey-de-catamarca | Rey de Catamarca | -67.161 | -27.204 |
  | 14 | cordoba | Córdoba | rey-de-cordoba | *(existing: Rey de Córdoba)* | -63.562 | -32.104 |
  | 18 | corrientes | Corrientes | rey-de-corrientes | Rey de Corrientes | -57.805 | -28.703 |
  | 22 | chaco | Chaco | rey-de-chaco | Rey del Chaco | -60.556 | -26.828 |
  | 26 | chubut | Chubut | rey-de-chubut | Rey de Chubut | -68.610 | -44.000 |
  | 30 | entre-rios | Entre Ríos | rey-de-entre-rios | Rey de Entre Ríos | -59.321 | -32.201 |
  | 34 | formosa | Formosa | rey-de-formosa | Rey de Formosa | -59.570 | -25.203 |
  | 38 | jujuy | Jujuy | rey-de-jujuy | Rey de Jujuy | -65.997 | -22.732 |
  | 42 | la-pampa | La Pampa | rey-de-la-pampa | Rey de La Pampa | -65.494 | -37.401 |
  | 46 | la-rioja | La Rioja | rey-de-la-rioja | Rey de La Rioja | -67.181 | -29.412 |
  | 50 | mendoza | Mendoza | rey-de-mendoza | Rey de Mendoza | -68.343 | -34.499 |
  | 54 | misiones | Misiones | rey-de-misiones | Rey de Misiones | -54.367 | -26.850 |
  | 58 | neuquen | Neuquén | rey-de-neuquen | Rey de Neuquén | -69.659 | -38.394 |
  | 62 | rio-negro | Río Negro | rey-de-rio-negro | Rey de Río Negro | -66.921 | -40.435 |
  | 66 | salta | Salta | rey-de-salta | Rey de Salta | -65.546 | -25.268 |
  | 70 | san-juan | San Juan | rey-de-san-juan | Rey de San Juan | -68.858 | -30.895 |
  | 74 | san-luis | San Luis | rey-de-san-luis | Rey de San Luis | -66.127 | -33.119 |
  | 78 | santa-cruz | Santa Cruz | rey-de-santa-cruz | Rey de Santa Cruz | -70.028 | -48.328 |
  | 82 | santa-fe | Santa Fe | rey-de-santa-fe | Rey de Santa Fe | -60.815 | -30.410 |
  | 86 | santiago-del-estero | Santiago del Estero | rey-de-santiago-del-estero | Rey de Santiago del Estero | -63.285 | -27.812 |
  | 90 | tucuman | Tucumán | rey-de-tucuman | Rey de Tucumán | -65.295 | -26.895 |
  | 94 | tierra-del-fuego | Tierra del Fuego | rey-de-tierra-del-fuego | Rey de Tierra del Fuego | -67.500 | -54.200 |

  Points are mapshaper `-points inner` on the IGN layer. Tierra del Fuego is hand-picked on Isla Grande, because its largest part is the Antarctic sector.

- [ ] **Step 4: Apply locally and run the SQL tests**
  Run: `npx supabase db reset --local`, then `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres PATH=/opt/homebrew/opt/libpq/bin:$PATH npm run test:sql`
  Expected: every file runs with no ERROR, ending in ROLLBACK. The reset also proves 0012 + `seed.sql` apply cleanly.

- [ ] **Step 5: Regenerate types and typecheck**
  Run: `npm run update-types && npm run typecheck`
  Expected:
  - `province_leaderboard` appears under `Functions`, and `provinces` under `Tables`;
  - `titles_priced` has `level` and `province_code`;
  - typecheck passes.

- [ ] **Step 6: Commit**
  `git add supabase/migrations/0012_geo_titles.sql supabase/tests/geo_titles_test.sql package.json src/types/database.types.ts docs/superpowers/specs/2026-10-19-geo-titles-design.md docs/superpowers/plans/2026-10-19-geo-titles.md && git commit -m "feat: add province crowns with PostGIS locations and a province leaderboard"`

---

### Task 2: Province summaries service

**Files:**
- Modify: `src/types/index.ts` (add `ProvinceReign`, `ProvinceSummary`)
- Modify: `src/services/titles.server.ts` (add `getProvinceCrowns`)
- Create: `src/services/map.server.ts`
- Test: `src/services/__tests__/map.server.test.ts`

**Interfaces:**
- Consumes: Task 1's `provinces`, `titles_priced.province_code` / `.level`, `rpc("province_leaderboard", { p_limit: 10 })`.
- Produces:
  ```ts
  // types/index.ts
  export type ProvinceReign = {
    id: string; holderName: string; holderIsBot: boolean;
    titleName: string; titleEmoji: string; titleSlug: string;
    durationLabel: string; isActive: boolean;
  };
  export type ProvinceSummary = {
    code: string; slug: string; name: string;
    crown: TitleCard | null; reigns: ProvinceReign[];  // reigns: rank order, ≤ 10
  };
  // services/titles.server.ts
  export async function getProvinceCrowns(supabase: SupabaseServerClient): Promise<Map<string, TitleCard>>  // keyed by province_code
  // services/map.server.ts
  export async function getProvinceSummaries(supabase: SupabaseServerClient): Promise<ProvinceSummary[]>  // ordered by province name
  ```

- [ ] **Step 1: Write the failing tests** in `map.server.test.ts`. Use `createSupabaseMock({ queryByTable: { provinces, titles_priced }, rpc })` and fake `Date` like `notifications.server.test.ts`.
  - `"groups leaderboard rows by province in rank order"`: two provinces; rows for `'50'` rank 1, 2 → `reigns` keeps that order.
    - Labels: `durationLabel` for an ended 30-day reign is `"30 días"`.
    - An active row has `isActive: true` and its label measured to the faked now.
  - `"attaches each province's crown as a TitleCard"`: a `titles_priced` row with `province_code: '50'`, `holder_username: 'juli'`, `current_price: 7`. Expected: `crown.price === 7` and `crown.holder.username === 'juli'`.
  - `"returns empty reigns and the unclaimed crown for a province without reigns"`: `reigns: []`, `crown.holder === null`, `crown.price === null`.
  - `"falls back to username, then Anónimo, for holder names"`: same rule as `displayName` in `titles.server.ts`.
  - `"orders provinces by name"`: `Córdoba` before `Mendoza` before `Tucumán`. Use `localeCompare(…, "es")`.
  - `"throws when any query fails"`: an rpc error rejects.

- [ ] **Step 2: Run them and see them fail**
  Run: `npx vitest run src/services/__tests__/map.server.test.ts`
  Expected: FAIL, cannot find module `../map.server`.

- [ ] **Step 3: Implement**
  - `getProvinceCrowns`: `pricedQuery(supabase).eq("level", "provincia")`, then a `Map` from `row.province_code` to `toTitleCard(row)`. Skip rows with a null `province_code`.
  - `getProvinceSummaries`: `Promise.all` of the `provinces` select (`code, slug, name`), `getProvinceCrowns` and the rpc. Group the rpc rows by `province_code`. Map each row to `ProvinceReign`: name via `displayName`, which you move or export from `titles.server.ts` rather than duplicate; `durationLabel = formatReignDuration(started_at, ended_at)`; `isActive = ended_at === null`.

- [ ] **Step 4: Run tests, lint and typecheck**
  Run: `npx vitest run && npm run lint && npm run typecheck`
  Expected: all PASS.

- [ ] **Step 5: Commit**
  `git commit -m "feat: summarize each province's crown and longest reigns"`

**→ Phase stop: push the branch and tell Nico Tasks 1–2 are done. Wait for his go-ahead.**

---

### Task 3: Map hover card, province panel and URL selection

**Files:**
- Modify: `scripts/build-argentina-geojson.sh` (`-each 'code=in1, kind="province"' -filter-fields code,kind`; the `name` property is dropped), then rerun it to regenerate `public/geo/argentina.json`
- Modify: `src/app/mapa/page.tsx`
- Modify: `src/features/map/components/kingdom-map.tsx`
- Create: `src/features/map/components/province-reign-list.tsx`
- Create: `src/features/map/components/province-panel.tsx`

**Interfaces:**
- Consumes: `getProvinceSummaries`, `ProvinceSummary`, `ProvinceReign` (Task 2); `BotBadge`; `formatCoronas`; `BASE_PRICE`.
- Produces:
  - `KingdomMap({ initialData }: { initialData: ProvinceSummary[] })`
  - `ProvinceReignList({ reigns }: { reigns: ProvinceReign[] })` — rows: rank colored gold, then outline, then pink for 1–3 (`RANK_COLOR` as in `hall-of-fame.tsx`); holder + `BotBadge`; `title · duration`; `ACTUAL` badge when active.
  - `ProvincePanel({ province, onClose }: { province: ProvinceSummary; onClose: () => void })`

- [ ] **Step 1: Regenerate the GeoJSON with `code`**
  Run: `./scripts/build-argentina-geojson.sh && python3 -c "import json;d=json.load(open('public/geo/argentina.json'));print(sorted(f['properties'].get('code','-') for f in d['features']))"`
  Expected: 24 two-digit codes plus `-` for the country feature.

- [ ] **Step 2: Page.** `/mapa` fetches `getProvinceSummaries(await createClient())` and renders `<KingdomMap initialData={…} />`.
  - Heading copy, per spec §6: "Pasá el mouse por una provincia para ver quién manda. Tocala para ver el ranking completo."

- [ ] **Step 3: KingdomMap**
  - Source: `promoteId: "code"` replaces `generateId`. Keep `tolerance: 1`.
  - `provinces` fill color: `case` selected → `#f9bd22` at 0.30, hover → `#b76dff` at 0.35, else `#b76dff` at 0.08.
  - Hover card: shown only when `matchMedia("(hover: hover)").matches`, positioned at the event point with flipping near edges.
    - Content: name, `TOP 3 REINADOS`, `ProvinceReignList` of `reigns.slice(0, 3)`, footer "Click para ver todo".
    - When empty: "Trono vacío · Coronate desde 1 👑".
  - Selection: read `useSearchParams().get("provincia")` and map it through `initialData` by slug. Unknown → none.
    - A click on a province: `router.replace(`/mapa?provincia=${slug}`, { scroll: false })`.
    - A click on the sea, or `onClose`: `router.replace("/mapa", { scroll: false })`.
    - Mirror the selected code into feature-state `selected`.
  - If `promoteId` with string codes doesn't drive feature-state (check hover/selected highlight in the browser), fall back to numeric codes in the GeoJSON and `Number(code)` in `setFeatureState`.

- [ ] **Step 4: ProvincePanel** (`<aside aria-label={`Provincia ${name}`}>`).
  - Placement: desktop `md:` docked right, full height, `w-80`; mobile a bottom sheet with `max-h-[60%] overflow-y-auto`.
  - Contents:
    - `PROVINCIA` label, name, close button `aria-label="Cerrar"`;
    - crown card with the CTA from Global Constraints;
    - `REYES CON MÁS REINADO` + `ProvinceReignList` (top 10). The heading is hidden when the list is empty.
  - The entrance animation is CSS-only and off under `prefers-reduced-motion`.

- [ ] **Step 5: Browser checks.** Dev server against the local stack (seeded Córdoba has 3 reigns). Use the CDP driver from the scratchpad; set device metrics **before** navigating.
  - Desktop 1440: hover Córdoba → card with 3 rows; hover Mendoza → empty state.
  - Desktop 1440: click Córdoba → panel, gold fill, URL `?provincia=cordoba`; ✕ clears it.
  - Load `/mapa?provincia=cordoba` → panel SSR'd with no hydration warning in the console.
  - Load `/mapa?provincia=nope` and `/mapa?provincia=a&provincia=b` → no panel, no error.
  - Mobile 390 with `Emulation.setTouchEmulationEnabled` + `Input.dispatchTouchEvent` tap on Córdoba → bottom sheet only, no hover card.
  - Screenshot each state.

- [ ] **Step 6: Lint, typecheck, commit**
  `git commit -m "feat: show province leaderboards on the map"`

---

### Task 4: Docs, verify, rollout

**Files:**
- Modify: `docs/DESIGN.md` (§3 Domain Model: `provinces` + geo columns on `titles`; §4 `/mapa` row: hover top 3 + panel)
- Modify: `docs/ROADMAP.md` (tick D12)

- [ ] **Step 1:** `npm run verify`. Expected: "All checks passed."
- [ ] **Step 2:** Commit the docs (`docs: mark D12 geo titles done`), push, `gh pr create` (English body, no attribution lines), `gh pr checks --watch`. Expected: verify + Vercel pass.
- [ ] **Step 3: Prod migration**
  Run `set -a && . ./.env.local && set +a && npx supabase db push --db-url "$SUPABASE_DB_URL" --dry-run`. Expected: only `0012_geo_titles.sql` pending.
  Then run the push without `--dry-run`, and check with psql: `SELECT count(*) FROM titles WHERE level = 'provincia'` = 24, and `rey-de-cordoba` still has 3 reigns.
- [ ] **Step 4:** Tell Nico: PR link, migration applied, ready to merge ("Create a merge commit").
