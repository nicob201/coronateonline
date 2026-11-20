import { expect, test } from "@playwright/test";
import { enterAsGuest } from "./helpers";

test("a guest throws a tomato at the current king and the count goes up", async ({ page }) => {
  await enterAsGuest(page);
  await page.goto("/t/mejor-programador");

  const tomato = page.getByRole("button", { name: /^Tirale un tomate \(\d+\)$/ });
  const before = Number(/\((\d+)\)/.exec((await tomato.getAttribute("aria-label")) ?? "")?.[1]);

  await tomato.click();

  await expect(page.getByRole("button", { name: `Tirale un tomate (${before + 1})` })).toBeVisible();
});
