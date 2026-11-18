import { expect, test } from "@playwright/test";

test("a guest can start saving the account with Google and is warned before signing out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ENTRAR COMO INVITADO" }).click();
  await page.waitForURL("**/titulos");

  // Google can't run here: answer Supabase's authorize call with the refusal it sends when that Google already has an account.
  let authorizeUrl = "";
  await page.route("**/auth/v1/user/identities/authorize**", (route) => {
    authorizeUrl = route.request().url();
    const back = new URL("/auth/callback", page.url());
    back.searchParams.set("next", "/perfil?vincular=google");
    back.searchParams.set("error", "server_error");
    back.searchParams.set("error_code", "identity_already_exists");
    return route.fulfill({ json: { url: back.toString() } });
  });

  await page.goto("/perfil");
  await page.getByRole("button", { name: "VINCULAR CON GOOGLE" }).click();

  await expect(page.getByText("Ese Google ya tiene una cuenta")).toBeVisible();
  await expect(page).toHaveURL(/\/perfil\?vincular=google&error=identity_already_exists$/);
  const authorize = new URL(authorizeUrl);
  expect(authorize.searchParams.get("provider")).toBe("google");
  expect(authorize.searchParams.get("redirect_to")).toContain("/auth/callback?next=%2Fperfil%3Fvincular%3Dgoogle");

  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("perdés esta cuenta");
    return dialog.dismiss();
  });
  await page.getByRole("button", { name: "Salir" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "GUARDÁ TU CUENTA" })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByRole("button", { name: "ENTRAR COMO INVITADO" })).toBeVisible();
});
