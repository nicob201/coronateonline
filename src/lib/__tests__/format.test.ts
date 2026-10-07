import { describe, expect, it } from "vitest";
import { formatCoronas, formatDate } from "../format";

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

describe("formatDate", () => {
  it("uses Argentina's calendar day even when UTC is already the next day", () => {
    expect(formatDate("2026-10-08T01:30:00Z")).toBe("7/10/2026");
  });
});
