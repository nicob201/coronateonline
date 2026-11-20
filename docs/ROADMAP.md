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
- [x] **D7** — Bots con `pg_cron` que destronan y tiran trash talk (además evita la pausa de Supabase free) — la pausa la evita un ping diario de GitHub Actions; pg_cron no cuenta como actividad
- [x] **D8** — Supabase Realtime: ticker y precio en vivo
- [x] **D9** — Notificaciones in-app (derivadas de `reigns` + `notification_seen`) + campanita + toast "¡Te destronaron!"
- [x] **D10** — Animación de coronación + View Transitions lista → detalle
- [x] **D10b** — Pasada de movimiento: animaciones baratas (solo compositor) + momentos de juego (saldo que cuenta, campanita, botones, popover, cards al scrollear)

## Semana 3 — Mapa del Reino 🗺️

Mapa oscuro de Argentina (bordes IGN, con Malvinas y Antártida) donde las coronas ocupadas se cargan según la zona visible y el zoom.

- [x] **D11** — `/mapa`: MapLibre GL + polígonos IGN de país y provincias en neón, pan / zoom, sin proveedor de tiles
- [x] **D12** — Títulos geográficos: ubicación PostGIS + nivel (provincia / ciudad / barrio) + seed de las 24 provincias
- [x] **D13** — Pins de coronas ocupadas en `/mapa` (solo provincias, `lon`/`lat` en `titles_priced`). Diferido hasta que haga falta: ciudades y barrios, RPC por bounding box con índice GIST y nivel de detalle por zoom
- [x] **D14** — Click en corona → tarjeta con rey, precio y "Destronar" (el panel de D12; el botón lleva a `/t/[slug]`); provincias que brillan según la rareza de su corona (borde dorado, relleno y pin por tier)
- [x] **D15** — Realtime en el mapa: la corona late cuando alguien la roba (cae una corona con anillos dorados sobre el pin; pines, brillo y panel abierto se actualizan solos)

## Semana 4 — Juego y comunidad

- [x] **D16** — `/rankings`: más caras, más disputadas ("más defendido" no se puede medir: no hay acción de defensa), reinados más largos, magnates
- [x] **D17** — Logros / badges en el perfil (11 logros derivados de los reinados públicos, sin tabla)
- [x] **D18** — Títulos creados por usuarios (cuestan Coronas, moderación en `/admin`): 30 👑 por propuesta, una pendiente a la vez, aprobar corona al creador a 1 👑, rechazar reembolsa
- [x] **D19** — Búsqueda, categorías y filtros en `/titulos`: buscador sin acentos, Provincias / Clásicos / De la comunidad, 4 órdenes, "Me alcanza", todo en la URL; "Creado por" en los títulos de la comunidad
- [x] **D20** — Reacciones 🍅 / 👏 al reinado actual, con rate limit: máx. 10 por minuto por usuario, no al propio reinado, totales en vivo por Realtime Broadcast privado (quién reaccionó no es público)

## Semana 5 — Ingeniería

- [x] **D21** — E2E con Playwright (invitado → destronar → ticker) en CI
- [x] **D22** — Tests SQL de los RPC con Supabase local en CI
- [x] **D23** — Revisión de seguridad: RLS y permisos, límites del perfil en la base, abuso de invitados (rate limit de Supabase por IP real, 10 por hora; captcha solo si aparece abuso), nombres visibles únicos sin distinguir mayúsculas ni acentos
- [x] **D24** — Vercel Analytics, sitemap / robots, manifest instalable (sin service worker), ícono de corona, fuente de íconos de 3 KB; Lighthouse en producción (mobile): rendimiento 100 / 100 / 99 (home / `/titulos` / `/mapa`), 100 en accesibilidad, buenas prácticas y SEO. Sentry se probó y se sacó: no compensa para una demo con poco tráfico
- [ ] **D25** — ~~Email "te destronaron" con Resend (opcional)~~ salteado por ahora: la web no manda mails

## Semana 6 — Packaging de portfolio

- [x] **D26** — README con GIF, diagrama de arquitectura (Mermaid) y 7 ADRs en `docs/adr/`
- [x] **D27** — Página `/acerca` como case study: problema, arquitectura, 7 decisiones con su costo, el bug del deadlock, lo que se haría distinto y los números
- [ ] **D28** — Comprar Coronas con checkout sandbox + webhook idempotente con firma
- [x] **D29** — README en inglés (`README.md`); el español pasa a `README.es.md`

## Hecho fuera del plan

- [x] Preparar el repo para hacerlo público: auditoría de secretos y del historial (limpia), licencia MIT, atribución al IGN en `/mapa` y créditos en el README

- [x] Arreglos pendientes + Content-Security-Policy con nonce por request, sin `x-powered-by`, 0 vulnerabilidades en `npm audit`
- [x] Convertir invitado en cuenta permanente: vincula su Google al mismo usuario y conserva coronas, saldo y logros; "Salir" avisa antes de perder la cuenta. Solo Google: el mail de Supabase sin SMTP propio solo llega al equipo
- [x] Pulido: la campanita dice "hace 2 horas", los bots llevan su chip 🤖 BOT en la billetera, el aviso de `/perfil`, la campanita y el toast, y el header entra en 360px aun con saldos de 5 cifras

## Pendientes

- Login con link mágico: sin SMTP propio solo llega al equipo, y el visitante ve "Email address not authorized" en inglés (configurar SMTP o esconder / traducir esa opción)

## Backlog

- Duelos / desafíos (Niveles 1 y 2 de la spec de Nivel 0)
- Temporadas con reset y salón de la fama histórico
- Mecánica alternativa: impuesto Harberger (el holder fija su precio y paga por mantenerlo)
- Bot de Telegram / Discord que anuncia coronaciones
