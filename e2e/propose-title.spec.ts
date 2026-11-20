import { expect, test, type Page } from "@playwright/test";
import { enterAsGuest, grantCoronasToNewestGuest } from "./helpers";

async function fillProposal(page: Page): Promise<void> {
  await page.getByLabel(/EMOJI/).fill("🧪");
  await page.getByLabel(/NOMBRE/).fill("Rey de las Pruebas");
  await page.getByLabel(/DESCRIPCI/).fill("Un título para probar el error.");
}

test("a guest without enough Coronas cannot submit a proposal", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/titulos/nuevo");

  await expect(page.getByRole("button", { name: "TE FALTAN 10 👑" })).toBeDisabled();
});

test("a stale second tab proposing again sees the pending-proposal error", async ({ page, context }) => {
  await enterAsGuest(page);
  await grantCoronasToNewestGuest(40);

  // The page hides the form once a proposal is pending, so the error needs two tabs: this one stays on the old form.
  const staleTab = await context.newPage();
  await staleTab.goto("/titulos/nuevo");
  await fillProposal(staleTab);

  await page.goto("/titulos/nuevo");
  await fillProposal(page);
  await page.getByRole("button", { name: "PROPONER POR 30 👑" }).click();
  await expect(page.getByRole("heading", { name: "«Rey de las Pruebas» está en revisión" })).toBeVisible();

  // 60 - 30 = 30 left, so the stale form still enables the button; the database answers CT404 and the action maps it.
  await staleTab.getByRole("button", { name: "PROPONER POR 30 👑" }).click();
  await expect(staleTab.locator("form").getByRole("alert")).toHaveText("Ya tenés una propuesta esperando revisión.");
});
