import { expect, test } from "@playwright/test";

test("the map page opens a province panel from the URL with its crown holder", async ({ page }) => {
  await page.goto("/mapa?provincia=cordoba");

  await expect(page.getByRole("heading", { name: "Argentina en juego" })).toBeVisible();
  const panel = page.getByRole("complementary", { name: "Provincia Córdoba" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Nico");

  await panel.getByRole("button", { name: "Cerrar" }).click();
  await expect(panel).toBeHidden();
});
