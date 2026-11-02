import { describe, expect, it } from "vitest";
import { describeMovement } from "../describe-movement";
import type { CoinMovement } from "@/types";

function movement(overrides: Partial<CoinMovement>): CoinMovement {
  return {
    id: "m1",
    amount: 20,
    reason: "welcome",
    created_at: "2026-10-07T00:00:00Z",
    titleName: null,
    counterpartName: null,
    ...overrides,
  };
}

describe("describeMovement", () => {
  it("labels the welcome grant", () => {
    expect(describeMovement(movement({}))).toBe("Saldo inicial");
  });

  it("labels the daily salary", () => {
    expect(describeMovement(movement({ reason: "salary", amount: 7 }))).toBe("Sueldo diario");
  });

  it("names who you dethroned and where", () => {
    expect(
      describeMovement(
        movement({ reason: "dethrone", amount: -40, titleName: "Rey de Córdoba", counterpartName: "Nico" }),
      ),
    ).toBe("Destronaste a Nico · Rey de Córdoba");
  });

  it("says you crowned yourself on an unclaimed title", () => {
    expect(
      describeMovement(movement({ reason: "dethrone", amount: -1, titleName: "Rey de Argentina" })),
    ).toBe("Te coronaste · Rey de Argentina");
  });

  it("names who dethroned you", () => {
    expect(
      describeMovement(
        movement({ reason: "dethroned", amount: 40, titleName: "Rey de Córdoba", counterpartName: "Fran" }),
      ),
    ).toBe("Te destronó Fran · Rey de Córdoba");
  });

  it("falls back to 'alguien' and drops the title when the reign is gone", () => {
    expect(describeMovement(movement({ reason: "dethroned", amount: 40 }))).toBe("Te destronó alguien");
  });

  it("labels a title proposal and its refund", () => {
    expect(describeMovement(movement({ reason: "proposal", amount: -30 }))).toBe("Propuesta de título");
    expect(describeMovement(movement({ reason: "proposal_refund", amount: 30 }))).toBe(
      "Reembolso: propuesta rechazada",
    );
  });
});
