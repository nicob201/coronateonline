import { expect, test } from "@playwright/test";
import { enterAsGuest } from "./helpers";

test("a guest claims the daily salary and the balance chip updates", async ({ page }) => {
  await enterAsGuest(page);
  await expect(page.getByRole("link", { name: "Saldo: 20 👑. Sueldo disponible" })).toBeVisible();

  await page.goto("/perfil");
  await page.getByRole("button", { name: /COBRAR SUELDO \+5 👑/ }).click();

  await expect(page.getByText("Sueldo cobrado. Volvé mañana por")).toBeVisible();
  await expect(page.getByRole("link", { name: "Saldo: 25 👑" })).toBeVisible();
});
