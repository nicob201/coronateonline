# Roadmap — de MVP a demo jugable

*2026-10-06 — el MVP de validación está cerrado. Esta etapa convierte CoronaTeOnline en una demo pública, jugable y viva, pensada como pieza de portfolio.*

## Norte

Un visitante entra desde un link, juega en 30 segundos sin pagar nada y ve un sitio que se mueve. El README y `/acerca` explican las decisiones técnicas.

**Decisión de modelo:** se reemplaza el pago real (transferencia + confirmación manual) por una moneda ficticia, **Coronas**, con saldo derivado de un ledger. Más adelante se suma "comprar Coronas" con checkout sandbox para mostrar una integración de pagos real.

## Forma de trabajo

- Cada día = una sesión = una rama `feat/*` o `fix/*` → commits chicos → PR con descripción → merge.
- Features chicas: diseño corto en el PR. Features grandes (billetera, bots, checkout): spec en `docs/superpowers/specs/`.
- CI (`npm run verify`) en verde antes de mergear.

## Semana 1 — Que exista y se pueda jugar

- [x] **D1** — Este roadmap + GitHub Actions (lint, typecheck, tests, build) + badge
- [x] **D2** — Deploy en Vercel + Supabase prod, `loading` / `error` / `not-found`
- [ ] **D3** — Login invitado en un click (Supabase anonymous sign-in) + navegación mobile (hoy el header oculta login y Explorar)
- [ ] **D4** — Billetera: ledger con saldo derivado + saldo inicial; `DESIGN.md` v2
- [ ] **D5** — RPC atómico `dethrone_with_coins` (debita, traspasa, compensa al destronado) + banner "demo"

## Semana 2 — Que se vea vivo

- [ ] **D6** — Sueldo diario con racha
- [ ] **D7** — Bots con `pg_cron` que destronan y tiran trash talk (además evita la pausa de Supabase free)
- [ ] **D8** — Supabase Realtime: ticker y precio en vivo
- [ ] **D9** — Notificaciones in-app (trigger en `reigns`) + campanita + toast "¡Te destronaron!"
- [ ] **D10** — Animación de coronación + View Transitions lista → detalle

## Semana 3 — Juego y comunidad

- [ ] **D11** — `/rankings`: más caro, más defendido, más largo, magnates
- [ ] **D12** — Logros / badges en el perfil
- [ ] **D13** — Títulos creados por usuarios (cuestan Coronas, moderación en `/admin`)
- [ ] **D14** — Búsqueda, categorías y filtros en `/titulos`
- [ ] **D15** — Reacciones 🍅 / 👏 al reinado actual, con rate limit

## Semana 4 — Ingeniería

- [ ] **D16** — E2E con Playwright (invitado → destronar → ticker) en CI
- [ ] **D17** — Tests SQL de los RPC con Supabase local en CI
- [ ] **D18** — Revisión de seguridad: RLS, abuso de invitados, rate limiting
- [ ] **D19** — Vercel Analytics, Sentry, sitemap / robots, PWA, Lighthouse ≥ 95
- [ ] **D20** — Email "te destronaron" con Resend (opcional)

## Semana 5 — Packaging de portfolio

- [ ] **D21** — README con GIF, diagrama de arquitectura y ADRs en `docs/adr/`
- [ ] **D22** — Página `/acerca` como case study
- [ ] **D23** — Comprar Coronas con checkout sandbox + webhook idempotente con firma
- [ ] **D24** — README en inglés

## Backlog

- 🗺️ Mapa del Reino: Argentina con el rey de cada provincia
- Duelos / desafíos (Niveles 1 y 2 de la spec de Nivel 0)
- Temporadas con reset y salón de la fama histórico
- Mecánica alternativa: impuesto Harberger (el holder fija su precio y paga por mantenerlo)
- Bot de Telegram / Discord que anuncia coronaciones
