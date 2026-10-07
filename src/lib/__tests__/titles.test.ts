import { describe, expect, it } from "vitest";
import { minClaimAmount, rankReignsByDuration, rarity, type ReignForRanking } from "../titles";

function reign(overrides: Partial<ReignForRanking> & { startedAt: string; endedAt: string | null }): ReignForRanking {
  return {
    id: "r1",
    holderName: "Test",
    pricePaid: 5,
    ...overrides,
  };
}

describe("rankReignsByDuration", () => {
  it("sorts by duration descending", () => {
    const input = [
      reign({ id: "short", startedAt: "2026-08-20T00:00:00Z", endedAt: "2026-08-21T00:00:00Z" }),
      reign({ id: "long", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-10T00:00:00Z" }),
    ];
    const result = rankReignsByDuration(input);
    expect(result[0].id).toBe("long");
    expect(result[1].id).toBe("short");
  });

  it("treats endedAt null as still running via now()", () => {
    const active = reign({ id: "active", startedAt: "2026-08-20T00:00:00Z", endedAt: null });
    const closed = reign({ id: "closed", startedAt: "2026-08-20T00:00:00Z", endedAt: "2026-08-21T00:00:00Z" });
    const result = rankReignsByDuration([closed, active]);
    expect(result[0].id).toBe("active");
    expect(result[0].isActive).toBe(true);
  });

  it("respects the limit parameter", () => {
    const input = [
      reign({ id: "a", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-10T00:00:00Z" }),
      reign({ id: "b", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-05T00:00:00Z" }),
      reign({ id: "c", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-03T00:00:00Z" }),
    ];
    const result = rankReignsByDuration(input, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  it("does not mutate the input array", () => {
    const input = [
      reign({ id: "b", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-10T00:00:00Z" }),
      reign({ id: "a", startedAt: "2026-08-01T00:00:00Z", endedAt: "2026-08-20T00:00:00Z" }),
    ];
    const original = [...input];
    rankReignsByDuration(input);
    expect(input).toEqual(original);
  });

  it("returns empty array for empty input", () => {
    expect(rankReignsByDuration([])).toEqual([]);
  });
});

describe("minClaimAmount", () => {
  it("is the base price (1) for an unclaimed title", () => {
    expect(minClaimAmount(null)).toBe(1);
  });

  it("is current price + 1 for a held title", () => {
    expect(minClaimAmount(39)).toBe(40);
  });
});

describe("rarity", () => {
  it("is legendario from 50", () => {
    expect(rarity(50)).toBe("legendario");
  });

  it("is epico from 20 up to 49", () => {
    expect(rarity(20)).toBe("epico");
    expect(rarity(49)).toBe("epico");
  });

  it("is comun below 20 and when unclaimed", () => {
    expect(rarity(19)).toBe("comun");
    expect(rarity(null)).toBe("comun");
  });
});
