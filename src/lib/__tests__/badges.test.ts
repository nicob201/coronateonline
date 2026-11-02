import { describe, expect, it } from "vitest";
import { computeBadges, type BadgeReign } from "../badges";

const NOW = Date.parse("2026-11-02T12:00:00Z");

function reign(overrides: Partial<BadgeReign> = {}): BadgeReign {
  return {
    titleSlug: "rey-de-la-pizza",
    pricePaid: 2,
    startedAt: "2026-11-01T00:00:00Z",
    endedAt: "2026-11-01T06:00:00Z",
    isProvince: false,
    dethroned: "none",
    ...overrides,
  };
}

function earned(reigns: BadgeReign[], timesDethroned = 0): string[] {
  return computeBadges(reigns, timesDethroned, NOW)
    .filter((b) => b.earned)
    .map((b) => b.name);
}

describe("computeBadges", () => {
  it("returns every badge locked for a player who never reigned", () => {
    const badges = computeBadges([], 0, NOW);
    expect(badges).toHaveLength(11);
    expect(badges.every((b) => !b.earned)).toBe(true);
  });

  it("awards the first crown for a claim of an empty throne", () => {
    expect(earned([reign()])).toEqual(["Primera Corona"]);
  });

  it("counts dethrones and tells bots from humans", () => {
    expect(earned([reign({ dethroned: "human" })])).toContain("Usurpador");
    expect(earned([reign({ dethroned: "human" })])).not.toContain("Cazabots");
    expect(earned([reign({ dethroned: "bot" })])).toContain("Cazabots");
    expect(earned(Array.from({ length: 9 }, () => reign({ dethroned: "human" })))).not.toContain(
      "Conquistador Serial",
    );
    expect(earned(Array.from({ length: 10 }, () => reign({ dethroned: "human" })))).toContain(
      "Conquistador Serial",
    );
  });

  it("awards Señor Feudal for a province reign", () => {
    expect(earned([reign({ isProvince: true })])).toContain("Señor Feudal");
  });

  it("awards Imperio for 3 overlapping crowns, ever", () => {
    const day = (start: string, end: string | null): BadgeReign =>
      reign({ titleSlug: start, startedAt: start, endedAt: end });
    const overlapping = [
      day("2026-10-01T00:00:00Z", "2026-10-01T10:00:00Z"),
      day("2026-10-01T02:00:00Z", "2026-10-01T08:00:00Z"),
      day("2026-10-01T04:00:00Z", "2026-10-01T06:00:00Z"),
    ];
    expect(earned(overlapping)).toContain("Imperio");

    const backToBack = [
      day("2026-10-01T00:00:00Z", "2026-10-01T02:00:00Z"),
      day("2026-10-01T02:00:00Z", "2026-10-01T04:00:00Z"),
      day("2026-10-01T03:00:00Z", null),
    ];
    expect(earned(backToBack)).not.toContain("Imperio");
  });

  it("awards Coleccionista for 5 distinct titles and Revancha for retaking one", () => {
    const five = ["a", "b", "c", "d", "e"].map((titleSlug) => reign({ titleSlug }));
    expect(earned(five)).toContain("Coleccionista");
    expect(earned(five)).not.toContain("Revancha");
    expect(earned(five.slice(0, 4))).not.toContain("Coleccionista");
    expect(earned([reign({ titleSlug: "a" }), reign({ titleSlug: "a" })])).toContain("Revancha");
  });

  it("awards Dinastía for a 7-day reign, ongoing ones measured until now", () => {
    expect(
      earned([reign({ startedAt: "2026-10-01T00:00:00Z", endedAt: "2026-10-08T00:00:00Z" })]),
    ).toContain("Dinastía");
    expect(earned([reign({ startedAt: "2026-10-26T12:00:00Z", endedAt: null })])).toContain(
      "Dinastía",
    );
    expect(earned([reign({ startedAt: "2026-10-27T00:00:00Z", endedAt: null })])).not.toContain(
      "Dinastía",
    );
  });

  it("awards Derroche Real from a 10 👑 crown", () => {
    expect(earned([reign({ pricePaid: 9 })])).not.toContain("Derroche Real");
    expect(earned([reign({ pricePaid: 10 })])).toContain("Derroche Real");
  });

  it("awards Mártir after being dethroned 10 times", () => {
    expect(earned([], 9)).not.toContain("Mártir");
    expect(earned([], 10)).toEqual(["Mártir"]);
  });
});
