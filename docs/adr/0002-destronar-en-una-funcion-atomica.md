# ADR 0002 — Destronar solo dentro de una función atómica de Postgres

- **Estado:** aceptada
- **Fecha:** 2026-10-07 (D5)

## Contexto

Destronar no es una sola escritura. Hay que leer el precio vigente (que decae con el tiempo), verificar el saldo del que desafía, cerrar el reinado actual, abrir el nuevo y anotar dos movimientos en el ledger. Si dos personas destronan el mismo título a la vez, o alguien gasta en dos pestañas, cualquier paso fuera de una transacción deja la base inconsistente.

Desde Next.js cada llamada a Supabase (PostgREST) es su propia transacción, así que esa lógica no puede vivir en el código de la app.

## Decisión

- La única forma de destronar es el RPC `dethrone_with_coins(p_title_id, p_amount, p_message)`, una función `SECURITY DEFINER`. Las políticas RLS prohíben escribir `titles` y `reigns` desde el cliente.
- Dentro de la función se bloquea primero el título (`FOR UPDATE`) y después el perfil del que desafía (`FOR NO KEY UPDATE`). Con los locks tomados se vuelven a validar el precio y el saldo.
- La Server Action solo valida la forma del input con Zod y llama al RPC. **El precio que muestra la pantalla nunca se usa para cobrar.**
- Suma cero: el destronado recibe exactamente lo que pagó el nuevo rey.

## El deadlock que encontramos

La primera versión bloqueaba el perfil con `FOR UPDATE`. En la revisión apareció un deadlock cuando dos usuarios se destronan entre sí al mismo tiempo. Las foreign keys del ledger y de `reigns.dethroned_user_id` toman un lock `KEY SHARE` sobre el perfil del otro, y `KEY SHARE` choca con `FOR UPDATE`. `FOR NO KEY UPDATE` alcanza para serializar los gastos de un mismo usuario y no choca con `KEY SHARE`.

## Consecuencias

- Dos desafíos simultáneos se ordenan solos: el segundo relee el precio nuevo y recibe "El monto no alcanza".
- Los bots ([ADR 0004](0004-bots-con-las-mismas-reglas.md)) reutilizan la misma función, así que no hay un segundo camino de escritura.
- La lógica crítica está en SQL. Se prueba con tests SQL (`supabase/tests/`) que corren en CI contra un Postgres local, no con Vitest.
- Los errores llegan como mensajes de Postgres; `translateRpcError` los pasa a textos para el usuario.
