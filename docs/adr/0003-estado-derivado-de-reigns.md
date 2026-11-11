# ADR 0003 — Rey actual, precio y notificaciones derivados de `reigns`

- **Estado:** aceptada
- **Fecha:** 2026-08-23 (diseño inicial), ampliada en D9 (2026-10-13)

## Contexto

El juego necesita saber muchas cosas sobre cada título: quién lo tiene, cuánto cuesta ahora, cuántas veces cambió de manos y a quién destronaron hace un rato. La tentación es guardar cada una en su columna (`titles.holder_id`, `titles.price`, una tabla `notifications`), pero cada copia es algo más que mantener sincronizado.

## Decisión

`reigns` es la única fuente de verdad. Cada fila es un reinado y el activo es el que tiene `ended_at IS NULL`, con un índice único parcial que garantiza uno solo por título.

- **Rey actual:** el reinado activo. `titles` no tiene columnas de dueño ni de precio.
- **Precio actual:** `title_current_price()` toma lo que se pagó y le aplica el decaimiento al momento de leer. Después de 3 días de gracia baja ~0,7 % por día hasta un piso. Lo expone la vista `titles_priced`. No hay cron ni columna guardada, y los parámetros viven en una tabla de una sola fila (`pricing_config`).
- **Notificaciones:** "te destronaron" es una consulta sobre `reigns` donde `dethroned_user_id` soy yo (últimos 14 días, máximo 10). Lo único que se guarda es cuándo las viste por última vez (`notification_seen`), escrito con la hora del servidor.
- **Rankings, historial, temporadas y logros** también son consultas sobre `reigns`.

## Alternativas

- **Columnas de dueño y precio en `titles`:** cada destronamiento tendría que actualizarlas en la misma transacción, y el decaimiento necesitaría un cron.
- **Tabla `notifications` llenada por un trigger:** copia datos que ya están en `reigns` y se desincroniza si un reinado se borra o se corrige.

## Consecuencias

- Corregir un dato es corregir una fila de `reigns`; todo lo demás se recalcula.
- El precio se calcula en un solo lugar (Postgres). La app no tiene una copia en TypeScript que pueda divergir.
- Las consultas son algo más pesadas que leer una columna. Para el volumen de la demo no se nota; si creciera, se podría materializar una vista.
