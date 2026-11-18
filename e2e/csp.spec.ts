import { expect, test } from "@playwright/test";

test("pages run clean under the CSP and a script injected into the HTML is blocked", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });

  for (const path of ["/", "/titulos", "/t/rey-de-la-pizza"]) {
    const response = await page.goto(path);
    expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  }
  expect(violations).toEqual([]);

  await page.route("/", async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace("</body>", "<script>document.title = 'pwned'</script></body>");
    await route.fulfill({ response, body });
  });
  await page.goto("/");

  await expect.poll(() => violations.length).toBeGreaterThan(0);
  await expect(page).not.toHaveTitle("pwned");
});
