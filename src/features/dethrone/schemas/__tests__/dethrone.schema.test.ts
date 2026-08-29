import { describe, expect, it } from "vitest";
import { dethroneSchema } from "../dethrone.schema";

const validInput = {
  titleId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  slug: "rey-de-cordoba",
  amount: "5000",
};

describe("dethroneSchema", () => {
  it("parses a valid input and coerces amount to a number", () => {
    const result = dethroneSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    expect(result.data?.amount).toBe(5000);
  });

  it("rejects an amount that is not a multiple of 1000", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "5500" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid titleId", () => {
    const result = dethroneSchema.safeParse({ ...validInput, titleId: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing slug", () => {
    const result = dethroneSchema.safeParse({ ...validInput, slug: "" });
    expect(result.success).toBe(false);
  });

  it("keeps a valid 80-char message", () => {
    const msg = "a".repeat(80);
    const result = dethroneSchema.safeParse({ ...validInput, message: msg });
    expect(result.success).toBe(true);
    expect(result.data?.message).toBe(msg);
  });

  it("rejects a message longer than 80 characters", () => {
    const result = dethroneSchema.safeParse({
      ...validInput,
      message: "a".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("transforms empty string message to undefined", () => {
    const result = dethroneSchema.safeParse({ ...validInput, message: "" });
    expect(result.success).toBe(true);
    expect(result.data?.message).toBeUndefined();
  });

  it("transforms whitespace-only message to undefined", () => {
    const result = dethroneSchema.safeParse({ ...validInput, message: "   " });
    expect(result.success).toBe(true);
    expect(result.data?.message).toBeUndefined();
  });

  it("treats omitted message as undefined", () => {
    const result = dethroneSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    expect(result.data?.message).toBeUndefined();
  });
});
