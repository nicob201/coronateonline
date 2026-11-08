import { expect, test } from "@playwright/test";

test("a visitor over the anonymous sign-in limit sees a friendly error", async ({ page }) => {
  await page.route("**/auth/v1/signup", (route) =>
    route.fulfill({
      status: 429,
      json: { code: 429, error_code: "over_request_rate_limit", msg: "Request rate limit reached" },
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "ENTRAR COMO INVITADO" }).click();

  await expect(page.getByText("No pudimos crear tu usuario invitado")).toBeVisible();
  await expect(page).toHaveURL("/");
});
