import { describe, expect, it } from "vitest";
import { proposeTitleSchema } from "../propose-title.schema";

const valid = { name: "Rey del Fernet", emoji: "🧉", description: "Nadie lo corta mejor." };

describe("proposeTitleSchema", () => {
  it("trims every field", () => {
    expect(
      proposeTitleSchema.parse({ name: "  Rey del Fernet ", emoji: " 🧉 ", description: " Nadie. " }),
    ).toEqual({ name: "Rey del Fernet", emoji: "🧉", description: "Nadie." });
  });

  it.each(["👑", "👨‍👩‍👧‍👦", "🇦🇷", "❤️"])("accepts the single emoji %s", (emoji) => {
    expect(proposeTitleSchema.safeParse({ ...valid, emoji }).success).toBe(true);
  });

  it.each(["", "ab", "👑👑", ":)"])("rejects %j as the emoji", (emoji) => {
    expect(proposeTitleSchema.safeParse({ ...valid, emoji }).success).toBe(false);
  });

  it("bounds the name to 3..40 and the description to 3..140 characters", () => {
    expect(proposeTitleSchema.safeParse({ ...valid, name: "ab" }).success).toBe(false);
    expect(proposeTitleSchema.safeParse({ ...valid, name: "a".repeat(41) }).success).toBe(false);
    expect(proposeTitleSchema.safeParse({ ...valid, description: "ok" }).success).toBe(false);
    expect(proposeTitleSchema.safeParse({ ...valid, description: "a".repeat(141) }).success).toBe(false);
    expect(proposeTitleSchema.safeParse({ ...valid, name: "a".repeat(40), description: "a".repeat(140) }).success).toBe(true);
  });
});
