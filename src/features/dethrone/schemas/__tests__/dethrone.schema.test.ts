import { describe, expect, it } from "vitest";
import { dethroneSchema } from "../dethrone.schema";

const validInput = {
  titleId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  amount: "5",
};

describe("dethroneSchema", () => {
  it("parses a valid input and coerces amount to a number", () => {
    const result = dethroneSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    expect(result.data?.amount).toBe(5);
  });

  it("accepts any positive integer amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "5500" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-integer amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "5.5" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "-3" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    const result = dethroneSchema.safeParse({ ...validInput, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("explains a bad amount in Spanish", () => {
    for (const amount of ["5.5", "0", "abc"]) {
      const result = dethroneSchema.safeParse({ ...validInput, amount });
      expect(result.error?.issues[0]?.message).toBe("Monto inválido.");
    }
  });

  it("rejects a non-uuid titleId", () => {
    const result = dethroneSchema.safeParse({ ...validInput, titleId: "nope" });
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
