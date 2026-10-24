import type { ProvinceSummary, Rarity } from "@/types";

const RARITY_TIER: Record<Rarity, number> = { comun: 1, epico: 2, legendario: 3 };

// How much a province shines: 0 for an empty throne, 1-3 by the held crown's rarity.
export function crownTier(province: ProvinceSummary): number {
  return province.crown?.holder ? RARITY_TIER[province.crown.rarity] : 0;
}

// GeoJSON points for the province crowns that have a holder and a location.
export function crownPins(provinces: ProvinceSummary[]): GeoJSON.FeatureCollection<GeoJSON.Point, { code: string; tier: number }> {
  return {
    type: "FeatureCollection",
    features: provinces.flatMap((p) =>
      p.crown?.holder && p.crown.point
        ? [{
            type: "Feature" as const,
            properties: { code: p.code, tier: crownTier(p) },
            geometry: { type: "Point" as const, coordinates: p.crown.point },
          }]
        : [],
    ),
  };
}
