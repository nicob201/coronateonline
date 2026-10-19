"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, MapGeoJSONFeature, MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const isProvince: ExpressionSpecification = ["==", ["get", "kind"], "province"];
const isCountry: ExpressionSpecification = ["==", ["get", "kind"], "country"];
const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];

// Neon globe of Argentina's provinces (IGN borders, no tile provider); hover or tap names a province.
export function KingdomMap() {
  const container = useRef<HTMLDivElement>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: MapLibreMap | undefined;
    let cancelled = false;

    // MapLibre touches window and WebGL, so it loads after hydration and only in the browser.
    import("maplibre-gl")
      .then(({ Map, setWorkerUrl }) => {
        if (cancelled || !container.current) return;
        setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        const m = new Map({
          container: container.current,
          style: {
            version: 8,
            projection: { type: "globe" },
            sources: {
              argentina: {
                type: "geojson",
                data: "/geo/argentina.json",
                generateId: true,
                // Extra simplification per zoom keeps the blurred glow from turning jagged coasts into spikes.
                tolerance: 1,
                attribution: "Límites: Instituto Geográfico Nacional",
              },
            },
            layers: [
              { id: "space", type: "background", paint: { "background-color": "#0e0e0e" } },
              {
                id: "provinces",
                type: "fill",
                source: "argentina",
                filter: isProvince,
                paint: { "fill-color": "#b76dff", "fill-opacity": ["case", hovered, 0.35, 0.08] },
              },
              {
                id: "province-glow",
                type: "line",
                source: "argentina",
                layout: { "line-join": "round" },
                filter: isProvince,
                paint: { "line-color": "#b76dff", "line-width": 6, "line-blur": 2, "line-opacity": 0.45 },
              },
              {
                id: "province-borders",
                type: "line",
                source: "argentina",
                layout: { "line-join": "round" },
                filter: isProvince,
                paint: { "line-color": "#ddb7ff", "line-width": 1 },
              },
              {
                id: "country-glow",
                type: "line",
                source: "argentina",
                layout: { "line-join": "round" },
                filter: isCountry,
                paint: { "line-color": "#f9bd22", "line-width": 10, "line-blur": 4, "line-opacity": 0.5 },
              },
              {
                id: "country-border",
                type: "line",
                source: "argentina",
                layout: { "line-join": "round" },
                filter: isCountry,
                paint: { "line-color": "#ffdf9f", "line-width": 1.5 },
              },
            ],
          },
          bounds: [-74, -56, -53, -21.7],
          // Top padding keeps the north clear of the floating heading panel.
          fitBoundsOptions: { padding: { top: 150, right: 24, bottom: 24, left: 24 } },
          attributionControl: { compact: true },
          dragRotate: false,
          touchPitch: false,
          locale: { "Map.Title": "Mapa de Argentina por provincias" },
        });
        map = m;
        m.touchZoomRotate.disableRotation();
        m.keyboard.disableRotation();

        let hoverId: string | number | undefined;
        const highlight = (feature: MapGeoJSONFeature | undefined) => {
          if (feature?.id === hoverId) return;
          if (hoverId !== undefined) m.setFeatureState({ source: "argentina", id: hoverId }, { hover: false });
          hoverId = feature?.id;
          if (hoverId !== undefined) m.setFeatureState({ source: "argentina", id: hoverId }, { hover: true });
          setProvince(feature ? String(feature.properties.name) : null);
        };
        m.on("mousemove", "provinces", (e) => highlight(e.features?.[0]));
        m.on("mouseleave", "provinces", () => highlight(undefined));
        // Taps have no hover, so a click selects the province under it (or clears on the sea).
        m.on("click", (e) => highlight(m.queryRenderedFeatures(e.point, { layers: ["provinces"] })[0]));
      })
      // No WebGL2 (GPUInitializationError) or a failed chunk load both leave the fallback text.
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  return (
    <div className="absolute inset-0">
      {/* Sized with h-full: unlayered .maplibregl-map { position: relative } beats Tailwind's absolute. */}
      <div ref={container} className="h-full" />
      {failed && (
        <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-body-sm font-body-sm text-on-surface-variant">
          Tu navegador no puede dibujar el mapa (necesita WebGL2).
        </p>
      )}
      {province && (
        <p className="glass-panel pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] rounded-xl px-5 py-3 text-center text-title-md font-title-md text-on-surface">
          {province}
        </p>
      )}
    </div>
  );
}
