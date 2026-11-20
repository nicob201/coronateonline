import { expect, test } from "@playwright/test";
import { dethroneTitle, enterAsGuest, realtimeJoins } from "./helpers";

test("a dethroned player gets the bell and the toast live, without reloading", async ({ page, browser, baseURL }) => {
  await enterAsGuest(page);
  await dethroneTitle(page, "ceo-de-los-lunes");

  // /perfil has no page-wide refresh, so only the header's "dethroned me" channel can deliver this: wait for its subscription.
  const subscribed = realtimeJoins(page, 1);
  await page.goto("/perfil");
  await subscribed;
  await expect(page.getByRole("button", { name: "Avisos", exact: true })).toBeVisible();

  // A second player, in its own browser session, takes the crown from the first one.
  const rival = await browser.newContext({ baseURL });
  const rivalPage = await rival.newPage();
  await enterAsGuest(rivalPage);
  await dethroneTitle(rivalPage, "ceo-de-los-lunes");
  await rival.close();

  await expect(page.getByRole("button", { name: "Avisos: 1 sin leer" })).toBeVisible();
  await expect(page.locator("#notification-toast")).toContainText("¡Te destronaron!");
  await expect(page.locator("#notification-toast")).toContainText("CEO de los Lunes");
});
