import { expect, test } from "@playwright/test";
import { enterAsGuest, largePng } from "./helpers";

test("a guest uploads a 1.5 MB avatar and sees it saved", async ({ page }) => {
  const png = largePng();
  // Past Next's 1 MB Server Action default and under the 2 MB the form promises.
  expect(png.length).toBeGreaterThan(1024 * 1024);
  expect(png.length).toBeLessThan(2 * 1024 * 1024);

  await enterAsGuest(page);
  await page.goto("/perfil");
  await page.locator("#avatar").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "GUARDAR", exact: true }).click();

  await expect(page.getByText("Guardado ✓")).toBeVisible();
  await expect(page.locator('img[src*="/storage/v1/object/public/avatars/"]')).toBeVisible();
});

test("a file that claims to be a PNG but is not an image is rejected", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/perfil");
  await page.locator("#avatar").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.alloc(64) });
  await page.getByRole("button", { name: "GUARDAR", exact: true }).click();

  await expect(page.getByText("El avatar debe ser JPG, PNG, WebP o GIF.")).toBeVisible();
  await expect(page.getByText("Guardado ✓")).toBeHidden();
});
