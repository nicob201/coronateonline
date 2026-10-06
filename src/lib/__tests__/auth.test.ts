import { describe, expect, it } from "vitest";
import { guestIdentity, safeNextPath } from "@/lib/auth";

describe("guestIdentity", () => {
  it("always yields a username the signup trigger keeps verbatim", () => {
    // Sweep the random source so every role and flavor is hit.
    for (let i = 0; i < 1000; i++) {
      const r = i / 1000;
      const { username, displayName } = guestIdentity(() => r);
      expect(username).toMatch(/^[a-z0-9_]{3,15}$/);
      expect(displayName.length).toBeLessThanOrEqual(50);
    }
  });

  it("shares the number between username and display name", () => {
    const values = [0, 0, 0.0427];
    const { username, displayName } = guestIdentity(() => values.shift() ?? 0);
    expect(username).toBe("plebeyo_0427");
    expect(displayName).toBe("Plebeyo sin corona #0427");
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/t/rey-de-cordoba")).toBe("/t/rey-de-cordoba");
  });

  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined])(
    "falls back for %s",
    (next) => {
      expect(safeNextPath(next, "/titulos")).toBe("/titulos");
    },
  );
});
