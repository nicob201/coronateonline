import { expect, test } from "@playwright/test";

test("a guest dethrones a seeded holder and the home ticker shows it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ENTRAR COMO INVITADO" }).click();
  await page.waitForURL("**/titulos");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();

  await page.goto("/t/rey-de-la-pizza");
  await page.getByRole("button", { name: "DESTRONAR", exact: true }).click();

  await expect(page.getByRole("heading", { name: "¡Te coronaste!" })).toBeVisible();
  await page.getByRole("button", { name: "SEGUIR" }).click();

  await page.goto("/");
  await expect(page.locator(".ticker")).toContainText(/#\d{4} DESTRONÓ A JUANA — REY DE LA PIZZA/);
});
