"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ExpressionSpecification, GeoJSONSource, MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { formatCoronas } from "@/lib/format";
import { BASE_PRICE } from "@/lib/titles";
import type { ProvinceSummary } from "@/types";
import { crownPins, crownTier, newCrowns } from "../crown-pins";
import { ProvincePanel } from "./province-panel";
import { ProvinceReignList } from "./province-reign-list";

const isProvince: ExpressionSpecification = ["==", ["get", "kind"], "province"];
const isCountry: ExpressionSpecification = ["==", ["get", "kind"], "country"];
const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
// Set per province on load from its crown's rarity: 0 empty throne, 1-3 held.
const tier: ExpressionSpecification = ["coalesce", ["feature-state", "tier"], 0];

const CARD_OFFSET = 16;
// Matches the .crown-steal animation in globals.css.
const STEAL_MS = 3000;

// Neon globe of Argentina's provinces: hover shows the top 3 reigns, a click opens the province panel.
export function KingdomMap({ initialData }: { initialData: ProvinceSummary[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const container = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerClass = useRef<typeof Marker | null>(null);
  const shown = useRef<ProvinceSummary[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hoverCode, setHoverCode] = useState<string | null>(null);

  // Handlers live in the one-time map effect, so they read the latest data through a ref.
  const latest = useRef({ initialData, router });
  useEffect(() => {
    latest.current = { initialData, router };
  });

  // The URL is the source of truth for the selection; an unknown or repeated slug selects nothing.
  const slug = searchParams.get("provincia");
  const province = slug ? (initialData.find((p) => p.slug === slug) ?? null) : null;
  const hoverProvince = hoverCode ? (initialData.find((p) => p.code === hoverCode) ?? null) : null;

  // Keeps the hover card next to the pointer, flipping it away from the container edges.
  const placeCard = () => {
    const el = card.current;
    const box = container.current;
    if (!el || !box) return;
    const { x, y } = pointer.current;
    const left = x + CARD_OFFSET + el.offsetWidth > box.clientWidth ? x - CARD_OFFSET - el.offsetWidth : x + CARD_OFFSET;
    const top = y + CARD_OFFSET + el.offsetHeight > box.clientHeight ? y - CARD_OFFSET - el.offsetHeight : y + CARD_OFFSET;
    el.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
  };
  const placeCardRef = useRef(placeCard);
  useEffect(() => {
    placeCardRef.current = placeCard;
  });
  useLayoutEffect(() => placeCard(), [hoverCode]);

  // Mirrors the selected province into feature-state (gold fill).
  const selectedCode = province?.code;
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !loaded || !selectedCode) return;
    m.setFeatureState({ source: "argentina", id: selectedCode }, { selected: true });
    return () => {
      mapRef.current?.setFeatureState({ source: "argentina", id: selectedCode }, { selected: false });
    };
  }, [loaded, selectedCode]);

  // Keeps pins and glow in step with live data and drops a beating crown where a reign just started.
  useEffect(() => {
    const m = mapRef.current;
    const Pulse = markerClass.current;
    if (!m || !Pulse || !loaded) return;
    m.getSource<GeoJSONSource>("crowns")?.setData(crownPins(initialData));
    for (const p of initialData) m.setFeatureState({ source: "argentina", id: p.code }, { tier: crownTier(p) });
    for (const point of shown.current ? newCrowns(shown.current, initialData) : []) {
      const el = document.createElement("div");
      el.className = "crown-steal";
      el.append(Object.assign(document.createElement("span"), { textContent: "👑" }));
      const pulse = new Pulse({ element: el }).setLngLat(point).addTo(m);
      setTimeout(() => pulse.remove(), STEAL_MS);
    }
    shown.current = initialData;
  }, [loaded, initialData]);

  useEffect(() => {
    let cancelled = false;

    // MapLibre touches window and WebGL, so it loads after hydration and only in the browser.
    import("maplibre-gl")
      .then(({ Map, Marker: MarkerClass, setWorkerUrl }) => {
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
                promoteId: "code",
                // Extra simplification per zoom keeps the blurred glow from turning jagged coasts into spikes.
                tolerance: 1,
                attribution: "FUENTE: Instituto Geográfico Nacional de la República Argentina (datos de octubre de 2026). Sin vinculación con el IGN.",
              },
              // Held province crowns, filled once loaded; the province layers below still answer hover and click.
              crowns: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
            },
            layers: [
              { id: "space", type: "background", paint: { "background-color": "#0e0e0e" } },
              {
                id: "provinces",
                type: "fill",
                source: "argentina",
                filter: isProvince,
                paint: {
                  "fill-color": ["case", selected, "#f9bd22", "#b76dff"],
                  "fill-opacity": ["case", selected, 0.3, hovered, 0.35, ["+", 0.08, ["*", 0.05, tier]]],
                },
              },
              {
                id: "province-glow",
                type: "line",
                source: "argentina",
                layout: { "line-join": "round" },
                filter: isProvince,
                paint: {
                  "line-color": ["case", [">", tier, 0], "#f9bd22", "#b76dff"],
                  "line-width": ["+", 6, ["*", 2, tier]],
                  "line-blur": 2,
                  "line-opacity": ["+", 0.45, ["*", 0.15, tier]],
                },
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
                id: "crown-halo",
                type: "circle",
                source: "crowns",
                paint: {
                  "circle-radius": ["+", 10, ["*", 4, ["get", "tier"]]],
                  "circle-color": "#f9bd22",
                  "circle-opacity": 0.25,
                  "circle-blur": 0.8,
                },
              },
              {
                id: "crown-pin",
                type: "circle",
                source: "crowns",
                paint: {
                  "circle-radius": ["+", 4, ["get", "tier"]],
                  "circle-color": "#f9bd22",
                  "circle-stroke-color": "#ffdf9f",
                  "circle-stroke-width": 1.5,
                },
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
        mapRef.current = m;
        markerClass.current = MarkerClass;
        m.touchZoomRotate.disableRotation();
        m.keyboard.disableRotation();
        m.on("load", () => setLoaded(true));

        // Taps fire compatibility mouse events, so hover only runs on devices that can really hover.
        const canHover = () => window.matchMedia("(hover: hover)").matches;
        let hoverId: string | undefined;
        const highlight = (code: string | undefined) => {
          if (code === hoverId) return;
          if (hoverId !== undefined) m.setFeatureState({ source: "argentina", id: hoverId }, { hover: false });
          hoverId = code;
          if (hoverId !== undefined) m.setFeatureState({ source: "argentina", id: hoverId }, { hover: true });
          setHoverCode(code ?? null);
        };
        m.on("mousemove", "provinces", (e) => {
          if (!canHover()) return;
          pointer.current = { x: e.point.x, y: e.point.y };
          highlight(String(e.features?.[0]?.properties.code));
          placeCardRef.current();
        });
        m.on("mouseleave", "provinces", () => highlight(undefined));
        // A click selects the province under it (or clears on the sea) by rewriting the URL.
        m.on("click", (e) => {
          const code = m.queryRenderedFeatures(e.point, { layers: ["provinces"] })[0]?.properties.code;
          const { initialData: data, router: r } = latest.current;
          const picked = data.find((p) => p.code === code);
          r.replace(picked ? `/mapa?provincia=${picked.slug}` : "/mapa", { scroll: false });
        });
      })
      // No WebGL2 (GPUInitializationError) or a failed chunk load both leave the fallback text.
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
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
      {hoverProvince && (
        <div
          ref={card}
          className="glass-panel pointer-events-none absolute top-0 left-0 z-10 flex w-72 flex-col gap-2 rounded-xl p-3"
        >
          <p className="text-title-md font-title-md text-on-surface">{hoverProvince.name}</p>
          {hoverProvince.reigns.length > 0 ? (
            <>
              <p className="text-label-caps font-label-caps text-tertiary">TOP 3 REINADOS</p>
              <ProvinceReignList reigns={hoverProvince.reigns.slice(0, 3)} />
              <p className="text-label-caps font-label-caps text-on-surface-variant">Click para ver todo</p>
            </>
          ) : (
            <p className="text-body-sm font-body-sm text-on-surface-variant">
              Trono vacío · Coronate desde {formatCoronas(BASE_PRICE)}
            </p>
          )}
        </div>
      )}
      {province && (
        <ProvincePanel
          province={province}
          onClose={() => router.replace("/mapa", { scroll: false })}
        />
      )}
    </div>
  );
}
