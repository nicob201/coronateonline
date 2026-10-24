import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getProvinceSummaries } from "../map.server";
import { createSupabaseMock } from "@/test/supabase-mock";

function province(code: string, slug: string, name: string) {
  return { code, slug, name };
}

function crownRow(provinceCode: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `title-${provinceCode}`,
    slug: `rey-${provinceCode}`,
    name: `Rey ${provinceCode}`,
    emoji: "👑",
    description: "Una corona.",
    created_at: "2026-10-01T00:00:00+00:00",
    current_price: null,
    price_floor: 1,
    reign_id: null,
    holder_user_id: null,
    holder_paid: null,
    reign_started_at: null,
    holder_username: null,
    holder_display_name: null,
    holder_avatar_url: null,
    holder_message: null,
    holder_is_bot: null,
    level: "provincia",
    province_code: provinceCode,
    lon: null,
    lat: null,
    ...overrides,
  };
}

function reignRow(provinceCode: string, rank: number, overrides: Record<string, unknown> = {}) {
  return {
    province_code: provinceCode,
    rank,
    reign_id: `reign-${provinceCode}-${rank}`,
    title_slug: `rey-${provinceCode}`,
    title_name: `Rey ${provinceCode}`,
    title_emoji: "👑",
    holder_username: "fran",
    holder_display_name: "Fran",
    holder_is_bot: false,
    price_paid: 5,
    started_at: "2026-08-01T00:00:00+00:00",
    ended_at: "2026-08-31T00:00:00+00:00",
    ...overrides,
  };
}

function mockWith(options: {
  provinces?: unknown[];
  crowns?: unknown[];
  reigns?: unknown[];
  rpcError?: unknown;
}) {
  return createSupabaseMock({
    queryByTable: {
      provinces: { data: options.provinces ?? [], error: null },
      titles_priced: { data: options.crowns ?? [], error: null },
    },
    rpc: { data: options.rpcError ? null : (options.reigns ?? []), error: options.rpcError ?? null },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getProvinceSummaries", () => {
  it("groups leaderboard rows by province in rank order", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza"), province("14", "cordoba", "Córdoba")],
      reigns: [
        reignRow("50", 1),
        reignRow("50", 2, { started_at: "2026-10-11T00:00:00+00:00", ended_at: null }),
        reignRow("14", 1),
      ],
    });

    const result = await getProvinceSummaries(supabase);
    const mendoza = result.find((p) => p.code === "50");

    expect(mendoza?.reigns.map((r) => r.id)).toEqual(["reign-50-1", "reign-50-2"]);
    expect(mendoza?.reigns[0]).toMatchObject({ durationLabel: "30 días", isActive: false });
    expect(mendoza?.reigns[1]).toMatchObject({ durationLabel: "3 días", isActive: true });
    expect(result.find((p) => p.code === "14")?.reigns).toHaveLength(1);
  });

  it("attaches each province's crown as a TitleCard", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza")],
      crowns: [
        crownRow("50", { current_price: 7, holder_username: "juli", holder_display_name: "Juli", reign_id: "r1" }),
      ],
    });

    const [mendoza] = await getProvinceSummaries(supabase);

    expect(mendoza.crown?.price).toBe(7);
    expect(mendoza.crown?.holder?.username).toBe("juli");
  });

  it("exposes the crown location as a [lon, lat] point, or null without one", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza"), province("14", "cordoba", "Córdoba")],
      crowns: [crownRow("50", { lon: -68.343, lat: -34.499 }), crownRow("14")],
    });

    const result = await getProvinceSummaries(supabase);

    expect(result.find((p) => p.code === "50")?.crown?.point).toEqual([-68.343, -34.499]);
    expect(result.find((p) => p.code === "14")?.crown?.point).toBeNull();
  });

  it("returns empty reigns and the unclaimed crown for a province without reigns", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza")],
      crowns: [crownRow("50")],
    });

    const [mendoza] = await getProvinceSummaries(supabase);

    expect(mendoza.reigns).toEqual([]);
    expect(mendoza.crown?.holder).toBeNull();
    expect(mendoza.crown?.price).toBeNull();
  });

  it("falls back to username, then Anónimo, for holder names", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza")],
      reigns: [
        reignRow("50", 1, { holder_display_name: "  " }),
        reignRow("50", 2, { holder_username: "", holder_display_name: null }),
      ],
    });

    const [mendoza] = await getProvinceSummaries(supabase);

    expect(mendoza.reigns.map((r) => r.holderName)).toEqual(["fran", "Anónimo"]);
  });

  it("orders provinces by name", async () => {
    const supabase = mockWith({
      provinces: [
        province("90", "tucuman", "Tucumán"),
        province("50", "mendoza", "Mendoza"),
        province("14", "cordoba", "Córdoba"),
      ],
    });

    const result = await getProvinceSummaries(supabase);

    expect(result.map((p) => p.name)).toEqual(["Córdoba", "Mendoza", "Tucumán"]);
  });

  it("throws when any query fails", async () => {
    const supabase = mockWith({
      provinces: [province("50", "mendoza", "Mendoza")],
      rpcError: new Error("rpc down"),
    });

    await expect(getProvinceSummaries(supabase)).rejects.toThrow("rpc down");
  });
});
