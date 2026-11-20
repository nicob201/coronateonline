import { describe, expect, it } from "vitest";
import { hasImageSignature } from "../image-signature";

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

describe("hasImageSignature", () => {
  it("accepts PNG, JPEG, GIF and WebP", () => {
    expect(hasImageSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe(true);
    expect(hasImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(hasImageSignature(new Uint8Array(ascii("GIF89a")))).toBe(true);
    expect(hasImageSignature(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP")]))).toBe(true);
  });

  it("rejects other files, other RIFF containers and empty input", () => {
    expect(hasImageSignature(new Uint8Array(ascii("<svg xmlns")))).toBe(false);
    expect(hasImageSignature(new Uint8Array([...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")]))).toBe(false);
    expect(hasImageSignature(new Uint8Array())).toBe(false);
  });
});
