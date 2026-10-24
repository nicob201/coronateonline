import { describe, expect, it } from "vitest";
import { crownPins, crownTier } from "../crown-pins";
import type { ProvinceSummary, TitleCard } from "@/types";

function card(overrides: Partial<TitleCard>): TitleCard {
  return {
    id: "t",
    slug: "rey",
    name: "Rey",
    emoji: "👑",
    description: "Una corona.",
    created_at: "2026-10-01T00:00:00+00:00",
    holder: null,
    holderUserId: null,
    price: null,
    priceFloor: 1,
    reignStartedAt: null,
    rarity: "comun",
    point: null,
    ...overrides,
  };
}

function province(code: string, crown: Partial<TitleCard> | null): ProvinceSummary {
  return { code, slug: `p-${code}`, name: `Provincia ${code}`, crown: crown && card(crown), reigns: [] };
}

const HOLDER = { username: "fran", display_name: "Fran", avatar_url: null, is_bot: false };

describe("crownPins", () => {
  it("pins only held crowns that have a location", () => {
    const pins = crownPins([
      province("14", { holder: HOLDER, point: [-63.562, -32.104] }),
      province("50", { holder: null, point: [-68.343, -34.499] }),
      province("90", { holder: HOLDER, point: null }),
      province("02", null),
    ]);

    expect(pins.features).toHaveLength(1);
    expect(pins.features[0].geometry.coordinates).toEqual([-63.562, -32.104]);
    expect(pins.features[0].properties).toEqual({ code: "14", tier: 1 });
  });
});

describe("crownTier", () => {
  it("is 0 for an empty throne and grows with the crown's rarity", () => {
    expect(crownTier(province("50", { holder: null, rarity: "legendario" }))).toBe(0);
    expect(crownTier(province("02", null))).toBe(0);
    expect(crownTier(province("14", { holder: HOLDER, rarity: "comun" }))).toBe(1);
    expect(crownTier(province("14", { holder: HOLDER, rarity: "epico" }))).toBe(2);
    expect(crownTier(province("14", { holder: HOLDER, rarity: "legendario" }))).toBe(3);
  });
});
