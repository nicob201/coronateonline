import { randomBytes } from "node:crypto";
import { crc32, deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import { z } from "zod";

// Enters as a guest from the home page and waits until the signed-in header shows.
export async function enterAsGuest(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "ENTRAR COMO INVITADO" }).click();
  await page.waitForURL("**/titulos");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

// A valid RGB PNG of random (incompressible) pixels, about 1.5 MB: bigger than Next's 1 MB Server Action default.
export function largePng(side = 720): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rowBytes = 1 + side * 3;
  const pixels = Buffer.concat(
    Array.from({ length: side }, () => Buffer.concat([Buffer.from([0]), randomBytes(rowBytes - 1)])),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Credits Coronas to the newest profile (the guest the test just entered as) through the service role.
export async function grantCoronasToNewestGuest(amount: number): Promise<void> {
  const apiUrl = process.env.E2E_API_URL;
  const key = process.env.E2E_SERVICE_ROLE_KEY;
  if (!apiUrl || !key) throw new Error("E2E_API_URL and E2E_SERVICE_ROLE_KEY come from playwright.config.ts");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const profiles = await fetch(`${apiUrl}/rest/v1/profiles?select=id&order=created_at.desc&limit=1`, { headers });
  const [{ id }] = z.array(z.object({ id: z.string() })).parse(await profiles.json());

  const credit = await fetch(`${apiUrl}/rest/v1/coin_ledger`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: id, amount, reason: "dethroned" }),
  });
  expect(credit.ok).toBe(true);
}
