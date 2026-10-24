#!/usr/bin/env bash
# Rebuilds public/geo/argentina.json (24 provinces + dissolved country) from IGN's official WFS layer, simplified for /mapa.
set -euo pipefail

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -sSf -o "$tmp/provincia.json" \
  "https://wms.ign.gob.ar/geoserver/ows?service=wfs&version=1.1.0&request=GetFeature&typeName=ign:provincia&outputFormat=application/json&srsName=EPSG:4326"

npx -y mapshaper@0.6.121 -i "$tmp/provincia.json" \
  -filter-islands min-area=30km2 remove-empty \
  -simplify 0.1% keep-shapes \
  -each 'code=in1, kind="province"' -filter-fields code,kind \
  -dissolve + name=country -each 'kind="country"' target=country \
  -o 'target=*' combine-layers format=geojson precision=0.001 public/geo/argentina.json
