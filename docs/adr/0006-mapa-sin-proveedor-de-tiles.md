# ADR 0006 — Mapa con MapLibre y un GeoJSON propio del IGN, sin proveedor de mapas

- **Estado:** aceptada
- **Fecha:** 2026-10-19 (D11)

## Contexto

`/mapa` muestra quién reina en cada provincia sobre un globo oscuro. Los proveedores de tiles (Mapbox, MapTiler, Google) piden API key, tienen cuotas y dibujan límites y nombres según sus propios criterios. Para Argentina eso incluye cómo muestran Malvinas y la Antártida.

El mapa solo necesita las 24 provincias. No hacen falta calles, ciudades ni etiquetas.

## Decisión

- **MapLibre GL** (open source), cargado con `import()` dinámico dentro de un efecto: necesita WebGL y solo corre en el navegador.
- **Proyección de globo.** El sector antártico no se estira como en Mercator.
- **Un solo GeoJSON propio**, `public/geo/argentina.json` (~150 KB):
  - Sale del WFS oficial del IGN (`ign:provincia`), con Malvinas y la Antártida dentro de Tierra del Fuego como en la cartografía oficial.
  - Se simplifica al 0,1 % con mapshaper y tiene las provincias más el contorno del país.
  - `scripts/build-argentina-geojson.sh` lo regenera byte por byte.
- **El estilo se define en el código:** un fondo más una fuente GeoJSON, sin tiles, sin glyphs y sin sprites. Los nombres de provincia se muestran en un chip HTML, no como etiquetas del mapa.
- Los niveles de rareza, el brillo de los bordes y los pines de corona salen de `feature-state` y de una fuente de puntos, que se actualizan en vivo ([ADR 0005](0005-tiempo-real-con-router-refresh.md)).

## Alternativas

- **Proveedor de tiles con API key:** costo y cuota, una dependencia externa más y límites que no controlamos.
- **Un SVG estático de Argentina:** no hay globo, zoom ni interacción táctil decente, y el hover y el resaltado habría que programarlos a mano.

## Consecuencias

- Cero servicios externos y cero claves: el mapa funciona igual en local, en los previews y en producción.
- Sin glyphs no hay etiquetas de texto dentro del mapa. Si algún día hacen falta, hay que servir fuentes de glyphs.
- Ciudades y barrios necesitarían otra capa de datos y, con muchos títulos, carga por zona (bbox) y nivel de zoom. Quedó postergado a propósito.
