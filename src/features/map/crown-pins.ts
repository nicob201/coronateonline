import type { ProvinceSummary } from "@/types";

// GeoJSON points for the province crowns that have a holder and a location.
export function crownPins(provinces: ProvinceSummary[]): GeoJSON.FeatureCollection<GeoJSON.Point, { code: string }> {
  return {
    type: "FeatureCollection",
    features: provinces.flatMap((p) =>
      p.crown?.holder && p.crown.point
        ? [{
            type: "Feature" as const,
            properties: { code: p.code },
            geometry: { type: "Point" as const, coordinates: p.crown.point },
          }]
        : [],
    ),
  };
}
