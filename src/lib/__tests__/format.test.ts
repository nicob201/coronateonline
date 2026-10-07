import { describe, expect, it } from "vitest";
import { formatCoronas } from "../format";

describe("formatCoronas", () => {
  it("formats an integer with the crown symbol", () => {
    expect(formatCoronas(40)).toBe("40 👑");
  });

  it("groups thousands the es-AR way", () => {
    expect(formatCoronas(1250)).toBe("1.250 👑");
  });

  it("keeps the sign of a debit", () => {
    expect(formatCoronas(-5)).toBe("-5 👑");
  });
});
