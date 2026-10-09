# Roadmap — de MVP a demo jugable

*2026-10-06 — el MVP de validación está cerrado. Esta etapa convierte CoronaTeOnline en una demo pública, jugable y viva, pensada como pieza de portfolio.*

## Norte

Un visitante entra desde un link, juega en 30 segundos sin pagar nada y ve un sitio que se mueve. El README y `/acerca` explican las decisiones técnicas.

**Decisión de modelo:** se reemplaza el pago real (transferencia + confirmación manual) por una moneda ficticia, **Coronas**, con saldo derivado de un ledger. Más adelante se suma "comprar Coronas" con checkout sandbox para mostrar una integración de pagos real.

## Forma de trabajo

- Cada día = una sesión = una rama `feat/*` o `fix/*` → commits chicos → PR con descripción → merge.
- Features chicas: diseño corto en el PR. Features grandes (billetera, bots, mapa, checkout): spec en `docs/superpowers/specs/`.
- CI (`npm run verify`) en verde antes de mergear.

## Semana 1 — Que exista y se pueda jugar

- [x] **D1** — Este roadmap + GitHub Actions (lint, typecheck, tests, build) + badge
- [x] **D2** — Deploy en Vercel + Supabase prod, `loading` / `error` / `not-found`
- [x] **D3** — Login invitado en un click (Supabase anonymous sign-in) + navegación mobile
- [x] **D4** — Billetera: ledger con saldo derivado + saldo inicial; `DESIGN.md` v2
- [x] **D5** — RPC atómico `dethrone_with_coins` (debita, traspasa, compensa al destronado) + banner "demo"

## Semana 2 — Que se vea vivo

- [x] **D6** — Sueldo diario con racha
- [ ] **D7** — Bots con `pg_cron` que destronan y tiran trash talk (además evita la pausa de Supabase free)
- [ ] **D8** — Supabase Realtime: ticker y precio en vivo
- [ ] **D9** — Notificaciones in-app (trigger en `reigns`) + campanita + toast "¡Te destronaron!"
- [ ] **D10** — Animación de coronación + View Transitions lista → detalle

## Semana 3 — Mapa del Reino 🗺️

Mapa oscuro de Argentina (bordes IGN, con Malvinas y Antártida) donde las coronas ocupadas se cargan según la zona visible y el zoom.

- [ ] **D11** — `/mapa`: MapLibre GL + polígonos IGN de país y provincias en neón, pan / zoom, sin proveedor de tiles
- [ ] **D12** — Títulos geográficos: ubicación PostGIS + nivel (provincia / ciudad / barrio) + seed de las 24 provincias
- [ ] **D13** — Carga por viewport: RPC por bounding box con índice GIST, nivel de detalle según zoom, seed de ciudades y barrios
- [ ] **D14** — Click en corona → tarjeta con rey, precio y "Destronar"; provincias que brillan según el valor de sus coronas
- [ ] **D15** — Realtime en el mapa: la corona late cuando alguien la roba

## Semana 4 — Juego y comunidad

- [ ] **D16** — `/rankings`: más caro, más defendido, más largo, magnates
- [ ] **D17** — Logros / badges en el perfil
- [ ] **D18** — Títulos creados por usuarios (cuestan Coronas, moderación en `/admin`)
- [ ] **D19** — Búsqueda, categorías y filtros en `/titulos`
- [ ] **D20** — Reacciones 🍅 / 👏 al reinado actual, con rate limit

## Semana 5 — Ingeniería

- [ ] **D21** — E2E con Playwright (invitado → destronar → ticker) en CI
- [ ] **D22** — Tests SQL de los RPC con Supabase local en CI
- [ ] **D23** — Revisión de seguridad: RLS, abuso de invitados (captcha), rate limiting, nombres visibles duplicados (hoy solo el `@username` es único)
- [ ] **D24** — Vercel Analytics, Sentry, sitemap / robots, PWA, Lighthouse ≥ 95
- [ ] **D25** — Email "te destronaron" con Resend (opcional)

## Semana 6 — Packaging de portfolio

- [ ] **D26** — README con GIF, diagrama de arquitectura y ADRs en `docs/adr/`
- [ ] **D27** — Página `/acerca` como case study
- [ ] **D28** — Comprar Coronas con checkout sandbox + webhook idempotente con firma
- [ ] **D29** — README en inglés

## Backlog

- Convertir invitado en cuenta permanente (vincular email / Google sin perder coronas)
- Duelos / desafíos (Niveles 1 y 2 de la spec de Nivel 0)
- Temporadas con reset y salón de la fama histórico
- Mecánica alternativa: impuesto Harberger (el holder fija su precio y paga por mantenerlo)
- Bot de Telegram / Discord que anuncia coronaciones
