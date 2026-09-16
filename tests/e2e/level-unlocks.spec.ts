import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("a level item previews locked, then becomes owned and equippable after XP", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=locker&test");
  await expect(page.getByTestId("locker-ink")).toHaveText("0 Ink", { timeout: 15000 });
  await page.getByRole("button", { name: "Trails", exact: true }).click();
  const chalk = page.locator('[data-item="trail.chalk"]');
  await expect(chalk.locator("button")).toHaveText("Unlocks at level 3"); await expect(chalk.locator("button")).toBeDisabled();
  await chalk.locator("b").click(); await expect(chalk).toHaveAttribute("data-selected", "true");
  await page.screenshot({ path: "test-results/qa/r3/locked-chalk.png" });
  const token = await page.evaluate(() => localStorage.getItem("bowdle.token"));
  const granted = await page.request.post("/api/dev/grant-xp", { headers: { Authorization: `Bearer ${token}` }, data: { xp: 1500 } });
  expect(granted.status()).toBe(200);
  await page.reload(); await expect(page.getByTestId("locker-ink")).toHaveText("60 Ink");
  await page.getByRole("button", { name: "Trails", exact: true }).click();
  await expect(chalk.locator("button")).toHaveText("Equip"); await chalk.locator("button").click();
  await expect(chalk.locator("button")).toHaveText("Equipped");
  await page.screenshot({ path: "test-results/qa/r3/owned-chalk.png" });
  expect(errors).toEqual([]);
});
