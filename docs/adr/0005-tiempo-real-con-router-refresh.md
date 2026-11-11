# ADR 0005 — Tiempo real: el cambio en la base dispara un `router.refresh()`

- **Estado:** aceptada
- **Fecha:** 2026-10-12 (D8)

## Contexto

Con bots y personas destronando, cada página era una foto: el ticker, los precios y los reyes solo cambiaban al recargar. El objetivo era abrir la home en dos pestañas, destronar en una y verlo en la otra en uno o dos segundos.

Los datos ya se cargan en Server Components, y el precio con decaimiento solo existe en Postgres ([ADR 0003](0003-estado-derivado-de-reigns.md)).

## Decisión

- `reigns` está en la publicación `supabase_realtime`. Cada destronamiento, humano o de bot, inserta exactamente una fila, así que un `INSERT` en `reigns` es la única señal de que algo cambió.
- El componente cliente `LiveRefresh` se suscribe a esos `INSERT` (Postgres Changes) y llama a `router.refresh()`. Next vuelve a renderizar los Server Components de la ruta y combina el resultado sin perder el estado del cliente ni el scroll.
- En `/t/[slug]` se filtra por título. En el header se filtra por `dethroned_user_id`, para la campanita de "te destronaron".
- Al reconectarse después de un corte (wifi, pestaña dormida) hace un refresh para ponerse al día.
- `LiveFlash` resalta lo que cambió comparando el valor nuevo con el anterior. No hay estado de juego en el navegador.

## Alternativas

- **Actualizar el estado del cliente con el payload del evento:** el payload es una fila cruda de `reigns`, sin nombres ni precio con decaimiento. Habría que hacer consultas desde el navegador y duplicar el mapeo.
- **Broadcast desde un trigger con un payload armado:** más SQL y canales privados, y el precio igual necesitaría un refresh.

## Consecuencias

- Una sola fuente de datos para la carga inicial y para las actualizaciones: los mismos servicios y componentes.
- Cada evento cuesta un ida y vuelta de RSC por pestaña abierta. Con el volumen de la demo (una docena de jugadas de bots por día más las humanas) es despreciable.
- `router.refresh()` vacía la caché del cliente y vuelve a prefetchear los links visibles, algo a tener en cuenta en páginas con muchos links.
- Las reacciones 🍅/👏 (D20) sí usan Broadcast privado: son eventos efímeros que no cambian la página, así que un refresh por cada tomate sería un desperdicio.
