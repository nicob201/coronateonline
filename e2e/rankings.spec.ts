import { expect, test } from "@playwright/test";

test("rankings show the four tables with the seeded crowns on top", async ({ page }) => {
  await page.goto("/rankings");

  for (const title of ["MÁS CARAS", "MÁS DISPUTADAS", "REINADOS MÁS LARGOS", "MAGNATES"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }

  const table = (title: string) => page.locator("section", { has: page.getByRole("heading", { name: title }) });
  // Rey de Córdoba is the priciest seeded crown (52 👑) and the most contested title (3 reigns).
  await expect(table("MÁS CARAS").getByRole("listitem").first()).toContainText("Rey de Córdoba");
  await expect(table("MÁS DISPUTADAS").getByRole("listitem").first()).toContainText("Rey de Córdoba");
  await expect(table("MAGNATES").getByRole("listitem").first()).toBeVisible();
});
