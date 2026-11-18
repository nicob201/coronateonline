import { describe, expect, it } from "vitest";
import { formatCoronas, formatDate, formatRelative } from "../format";

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

describe("formatRelative", () => {
  const now = Date.parse("2026-11-18T20:00:00Z");
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it("says 'recién' under a minute, and for a timestamp slightly in the future", () => {
    expect(formatRelative(ago(30), now)).toBe("recién");
    expect(formatRelative(ago(-5), now)).toBe("recién");
  });

  it("rounds down to the largest whole unit", () => {
    expect(formatRelative(ago(5 * 60), now)).toBe("hace 5 minutos");
    expect(formatRelative(ago(2 * 3600 + 59 * 60), now)).toBe("hace 2 horas");
    expect(formatRelative(ago(26 * 3600), now)).toBe("ayer");
    expect(formatRelative(ago(3 * 86400), now)).toBe("hace 3 días");
  });
});
