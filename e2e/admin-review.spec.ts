import { expect, test, type Page } from "@playwright/test";
import { enterAsGuest, grantCoronasToNewestGuest, makeNewestGuestAdmin } from "./helpers";

// A guest with enough Coronas submits a proposal and is promoted to admin, so it can review it at /admin.
async function proposeAsAdmin(page: Page, name: string): Promise<void> {
  await enterAsGuest(page);
  await grantCoronasToNewestGuest(40);

  await page.goto("/titulos/nuevo");
  await page.getByLabel(/EMOJI/).fill("🧪");
  await page.getByLabel(/NOMBRE/).fill(name);
  await page.getByLabel(/DESCRIPCI/).fill("Un título de prueba para el panel de admin.");
  await page.getByRole("button", { name: "PROPONER POR 30 👑" }).click();
  await expect(page.getByRole("heading", { name: `«${name}» está en revisión` })).toBeVisible();

  await makeNewestGuestAdmin();
}

test("a regular guest sees the not-found page on /admin, never the proposals", async ({ page }) => {
  await enterAsGuest(page);
  // The page streams, so the status is already 200 when notFound() runs: assert what the user sees.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "ESTE TRONO NO EXISTE" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Propuestas/ })).toBeHidden();
});

test("an admin approves a proposal: the title goes live and the author is crowned", async ({ page }) => {
  await proposeAsAdmin(page, "Rey del Fernet Eterno");

  await page.goto("/admin");
  await expect(page.getByText("Rey del Fernet Eterno")).toBeVisible();
  await page.getByRole("button", { name: "APROBAR" }).click();
  await expect(page.getByText("Rey del Fernet Eterno")).toBeHidden();

  await page.goto("/t/rey-del-fernet-eterno");
  await expect(page.getByRole("heading", { name: "Rey del Fernet Eterno", level: 1 })).toBeVisible();
  await page.goto("/perfil");
  await page.getByRole("link", { name: "Aprobado · ver título" }).click();
  await expect(page).toHaveURL(/\/t\/rey-del-fernet-eterno$/);
});

test("an admin rejects a proposal and the author gets the Coronas back", async ({ page }) => {
  await proposeAsAdmin(page, "Rey de la Siesta");
  await expect(page.getByRole("link", { name: "Saldo: 30 👑" })).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "RECHAZAR Y REEMBOLSAR" }).click();
  await expect(page.getByText("Rey de la Siesta")).toBeHidden();

  await page.goto("/perfil");
  await expect(page.getByText("Rechazado · reembolsado")).toBeVisible();
  await expect(page.getByRole("link", { name: "Saldo: 60 👑" })).toBeVisible();
});
