# Geographic Titles — Design

*2026-10-19 — design approved in conversation (mockup reviewed in the visual companion), pending written-spec review. Roadmap day D12. Branch: `feat/geo-titles`.*

## 1. Context & motivation

D11 shipped `/mapa`: a neon globe with IGN province borders, where hovering names a province. Nothing on it is playable yet. D12 makes the map about **who rules each province**:

- **Hover** a province → a small card with the **top 3 longest reigns** in that province.
- **Click / tap** a province → a panel (desktop: right side, in the empty space beside the globe; mobile: bottom sheet) with the province's own crown and a longer ranking.

Nico's rule for the ranking, in his words: *"si el usuario x es rey de xxxxx hace 200 días, no importa de qué ciudad de la provincia sea, debería salir en el top 3 si es que corresponde"*. The ranking aggregates **every title located in the province**: the province crown now, plus the cities and barrios that arrive in D13.

## 2. Goals / non-goals / anti-goals

**Goals**
- Any title can be geographic: a **level** (`provincia` / `ciudad` / `barrio`), a **province**, and a **PostGIS point location**.
- 24 **province crowns** (one per IGN province), playable like any other title: same price, decay, dethrone RPC and bots.
- `/mapa` hover card (top 3) and click panel (crown card + top 10), per the approved mockup.

**Non-goals (later roadmap days)**
- Cities/barrios seed, bounding-box RPC, GIST index, crown markers on the map: **D13**.
- Provinces glowing by crown value: **D14**. Realtime pulses on the map: **D15**. Search and filters: **D19**.
- Dethroning from the panel. Its CTA links to `/t/[slug]`, where the existing dethrone form lives.

**Anti-goals**
- A ranking that drops or double-counts reigns. One row per reign: a user holding two crowns in a province appears twice.
- A schema change that breaks the code running in prod before the merge. The DB is shared (see §7), so the migration must be additive.

## 3. Decided in conversation (Nico)

- Hover shows the **top 3**; click shows a bigger list beside the map; mobile has no hover, so a tap opens the panel.
- The ranking **joins all titles in the province** (province + future cities + barrios).
- The ranking includes **active and ended reigns**, ordered by duration. Active ones are measured to `now()` and marked **ACTUAL** (approved mockup).
- Search comes later.

## 4. Data model (builder's calls, made here)

Migration `0012_geo_titles.sql`:

- `CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions`.
- New table **`provinces`**: `code text PRIMARY KEY` (2-digit INDEC code, IGN's `in1`, e.g. `'14'` Córdoba), `slug text UNIQUE NOT NULL`, `name text NOT NULL`. 24 rows. RLS on, public `SELECT` policy, no write policies.
- New nullable columns on **`titles`**:
  - `level text CHECK (level IN ('provincia','ciudad','barrio'))`
  - `province_code text REFERENCES provinces(code)`
  - `location extensions.geography(Point, 4326)`
  - A CHECK requiring all three to be NULL (a regular title) or all three to be set (a geographic title).
  - A partial unique index on `province_code` WHERE `level = 'provincia'`, so a province has exactly one province crown.
- **Seed lives in the migration**, because `seed.sql` only runs locally and prod needs the 24 crowns:
  - 24 `provinces` rows (IGN names; slugs like `cordoba`, `caba`, `tierra-del-fuego`).
  - 23 new titles `Rey de <Provincia>` (slug `rey-de-<province slug>`), each with an emoji and a one-line playful es-AR description. Special names:
    - Buenos Aires → **"Rey de la Provincia de Buenos Aires"**
    - CABA → **"Rey de CABA"**
    - Tierra del Fuego, Antártida e Islas del Atlántico Sur → **"Rey de Tierra del Fuego"**
  - The **existing `rey-de-cordoba` becomes Córdoba's province crown**: it keeps its id, slug and its 3 prod reigns, and its description (today "capital provincial") is rewritten for the province.
  - `rey-de-argentina` and `reina-de-las-malvinas` stay non-geographic for now.
  - `ON CONFLICT (slug) DO NOTHING` on inserts, so a re-run is a no-op.
- **Province crown location** = an interior point of the province polygon (`mapshaper -points inner` on the IGN layer), hard-coded in the migration. Not the capital, which would collide with the capital-city crown in D13.
- **GeoJSON:** `scripts/build-argentina-geojson.sh` also keeps `code` (`in1`) on province features. The map joins polygons to data by `code`.

## 5. Read path

- **`province_leaderboard(p_limit int DEFAULT 10)`**: SQL function, `STABLE`, `SECURITY INVOKER`, `EXECUTE` granted to `anon` and `authenticated`.
  - Rows are every reign of every geographic title, with `duration = COALESCE(ended_at, now()) - started_at`.
  - It keeps `row_number() OVER (PARTITION BY province_code ORDER BY duration DESC, started_at) <= p_limit`.
  - Each row returns: `province_code`, `rank`, `reign_id`, title `slug`/`name`/`emoji`, holder `username`/`display_name`/`is_bot`, `price_paid`, `started_at`, `ended_at`.
  - At most 240 rows (24 × 10), well under PostgREST's row cap.
- **Province crown card**: from `titles_priced` (holder, effective current price, slug) for the 24 province crowns. The view does not expose the new columns (its column list was fixed when it was created). Pick the rows by id from `titles WHERE level = 'provincia'`, or recreate the view with `province_code`; builder's choice.
- **`services/map.server.ts`**: one function returns `ProvinceSummary[]` (code, crown card, ranked reigns), with types derived from the generated Supabase types.
  - Durations use the existing `formatReignDuration` from `lib/titles.ts`. The current `rankReignsByDuration` sorts in JS; here the SQL already ranked the rows.
- **`/mapa` page** (Server Component) fetches the summary and passes it as `initialData` to `KingdomMap`. Hover and click read from memory: no request per interaction.
- **Bots** appear in the ranking with the 🤖 BOT badge, consistent with "Reinados más largos" on title pages. The Hall of Fame stays human-only.
- Data is as fresh as the page load. Live updates are D15.

## 6. UI (approved mockup)

- **Hover card** (pointer devices only) near the cursor. It replaces D11's name chip. Contents:
  - province name and **TOP 3 REINADOS**;
  - rows: rank (gold, silver and pink for 1–3), holder name + bot badge, `title · duration`, **ACTUAL** badge when active;
  - footer: "Click para ver todo".
  - Empty province: "Trono vacío · Coronate desde 1 👑".
- **Click / tap** selects a province: gold fill (feature-state), plus the panel.
  - **Desktop (≥ md):** glass panel docked right, full map height.
  - **Mobile:** bottom sheet.
- **Panel contents:**
  - `PROVINCIA` label, province name, close ✕.
  - **Crown card**: `CORONA PROVINCIAL`, emoji + title name, `Rey: … · Valor: N 👑`, CTA linking to `/t/[slug]`. The CTA reads **DESTRONAR · (price+1) 👑** when held and **CORONARME · 1 👑** when free.
  - **REYES CON MÁS REINADO**: top 10, same row style as the hover card.
- **Selection lives in the URL**: `/mapa?provincia=<slug>`, per AGENTS.md (tab-like state goes in search params).
  - Clicking updates it with `router.replace` (no scroll). ✕ or clicking the sea clears it.
  - Loading the URL opens the panel. An unknown slug is ignored.
  - The param is matched against the province list in `initialData`, which comes from `provinces`; it never reaches a query.
- The D11 heading panel's "Las coronas de cada territorio llegan pronto" becomes an instruction: hover a province to see who rules it, click it for the full ranking (exact copy is the builder's).
- Copy in es-AR. Locale-explicit number formatting (`formatCoronas`). Panel/sheet motion respects `prefers-reduced-motion`.

## 7. Rollout & side effects

- PR green → `supabase db push --db-url` → Nico merges. The migration is additive: new columns are nullable, and old code ignores the new table, columns and function.
- **Side effects, accepted:**
  - `/titulos` grows from 12 to 35 cards; filters come in D19.
  - The home "trending" list is unaffected until province crowns get expensive.
  - Bots now pick among 35 titles; claiming an unclaimed crown burns 1 👑, as today.
- `npm run update-types` after applying the migration locally. Select lists avoid `location`: the PostGIS type comes through as `unknown`.

## 8. Tests

- **SQL** (`supabase/tests/geo_titles_test.sql`, added to `test:sql`):
  - the leaderboard aggregates reigns across two titles in one province;
  - active reigns are ranked by `now()`;
  - the per-province limit holds;
  - non-geographic titles are excluded;
  - the all-or-nothing CHECK and the one-crown-per-province index reject bad rows;
  - the 24 crowns exist after the migration.
- **Vitest** for `services/map.server.ts`: grouping by province, merging the crown card, empty provinces. Use the existing chainable Supabase mock.

## 9. Left to the builder

- The 23 emojis and descriptions (playful, es-AR, ≤ the current descriptions' length).
- The interior-point coordinates (generated, then pasted).
- Whether the camera eases to make room for the desktop panel (`easeTo` with right padding) or stays put.
- Hover-card positioning and edge flipping.
