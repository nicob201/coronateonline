# ADR 0001 — Coronas enteras y saldo derivado del ledger

- **Estado:** aceptada
- **Fecha:** 2026-10-07 (D4)

## Contexto

La primera versión cobraba en pesos reales: el usuario transfería a un alias y el destronamiento quedaba pendiente hasta que un admin lo aprobaba. Para una demo de portfolio eso era imposible de probar: nadie va a transferir plata para ver cómo funciona. Además hacía falta un modelo de dinero que no se desincronizara con el uso concurrente.

## Decisión

- La moneda es virtual: **Coronas (👑)**, siempre **enteras**. No hay decimales ni floats.
- Cada movimiento es una fila de `coin_ledger`, una tabla **append-only** con monto con signo (crédito > 0, débito < 0) y un motivo (`welcome`, `dethrone`, `dethroned`, `salary`, `proposal`, `proposal_refund`).
- **El saldo no se guarda en ningún lado.** `coin_balance(user_id)` lo calcula como la suma de las filas del usuario.
- Solo funciones `SECURITY DEFINER` escriben el ledger. RLS deja que cada usuario lea únicamente sus filas.
- Las reglas viven en la base: `CHECK` para montos distintos de cero, índice único parcial para un solo `welcome` por perfil y un solo `salary` por día argentino.
- Cada cuenta, invitados incluidos, arranca con 20 👑. Comprar Coronas con un checkout sandbox queda para más adelante (D28).

## Alternativas

- **Columna `balance` en `profiles`:** son dos fuentes de verdad que se pueden desincronizar, y cada gasto necesitaría un `UPDATE` cuidadoso para no perder escrituras concurrentes.
- **Plata real desde el día uno:** frena a cualquiera que quiera probar la demo en 30 segundos.

## Consecuencias

- La billetera es el historial: los movimientos del perfil son una consulta sobre el ledger, sin tablas extra.
- La racha del sueldo diario también se deriva (`salary_status()`), con la misma idea.
- Leer el saldo es un `SUM` por consulta. Con el volumen de la demo no importa; si creciera, se agregaría un snapshot periódico sin cambiar el modelo.
- La economía es de suma cero salvo un sumidero: reclamar un título libre quema las Coronas pagadas.
