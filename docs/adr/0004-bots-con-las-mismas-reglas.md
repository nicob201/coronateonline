# ADR 0004 — Bots que juegan con las mismas reglas, desde `pg_cron`

- **Estado:** aceptada
- **Fecha:** 2026-10-09 (D7)

## Contexto

Una demo con pocos visitantes se ve muerta: los mismos reyes durante semanas, nada en el ticker, nadie a quien destronar. Hacía falta movimiento constante sin depender de que entre gente.

## Decisión

- Hay cinco bots declarados: `profiles.is_bot`, con la insignia 🤖 BOT en la interfaz. No tienen contraseña, así que nadie puede entrar como uno.
- **Juegan con las reglas humanas.** `bot_move()` actúa como el bot durante una transacción (setea `request.jwt.claims`) y llama al mismo `dethrone_with_coins` ([ADR 0002](0002-destronar-en-una-funcion-atomica.md)). Tienen saldo en el ledger, bienvenida de 20 👑 y sueldo diario como cualquiera.
- `pg_cron` corre `bot_tick()` cada 20 minutos. Cada bot cobra su sueldo y, con probabilidad 1 en 6, uno toma un título que pueda pagar. Eso da cerca de una jugada cada 2 horas.
- **Son reyes débiles a propósito.** Pujan el mínimo, nunca más de 15 👑, y una corona humana queda fuera de su alcance durante 12 horas. El precio de un título en manos de un bot se reduce a la mitad cada 6 horas y no cuenta para el piso de precio, así que un recién llegado siempre puede ganarle.

## Alternativas

- **Un cron en Vercel o GitHub Actions que llame a la app:** agrega un endpoint con credenciales de servicio y un segundo camino de escritura.
- **Bots con reglas propias (escribir `reigns` directo):** más simple, pero cualquier regla nueva habría que duplicarla y los bots podrían romper invariantes.

## Consecuencias

- Los bots prueban de verdad el RPC: los destronamientos cruzados que generan hicieron que el arreglo del deadlock importara.
- Toda la lógica vive en la base. No hay workers ni servicios extra.
- `pg_cron` no cuenta como actividad para la pausa del plan gratuito de Supabase. Un workflow diario de GitHub Actions pide `/titulos` para mantener el proyecto despierto.
- Los bots quedan fuera del Salón de la Fama y de los rankings de personas.
