import { expect, test } from "@playwright/test";
import { collectErrors, returningPlayer } from "./helpers.ts";

test.beforeEach(({ page }) => returningPlayer(page));

test("a new explorer gets an account, a profile and the leaderboard", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=profile&test");
  await expect(page.getByTestId("level")).toHaveText("Level 1", { timeout: 15_000 });
  await expect(page.getByTestId("ink")).toHaveText("0 Ink");
  await page.locator("[data-field=name]").fill("Map Reader");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.locator(".bowdle-profile h2")).toHaveText("Map Reader");
  await page.screenshot({ path: "test-results/qa/m10/profile.png", fullPage: true });
  const token = await page.evaluate(() => localStorage.getItem("bowdle.token"));
  expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
  await page.goto("/?scene=leaderboard&test");
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  await expect(page.locator(".bowdle-leaderboard h2")).toHaveText(/^Season \d{4}-S[1-4]$/);
  await page.screenshot({ path: "test-results/qa/m10/leaderboard.png", fullPage: true });
  const profile = await page.request.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } });
  expect(await profile.json()).toMatchObject({ name: "Map Reader" });

  await page.goto("/?scene=profile&test");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Click again to delete forever" }).click();
  await expect(page.locator(".bowdle-profile h2")).toHaveText("Account deleted");
  expect(await page.evaluate(() => localStorage.getItem("bowdle.token"))).toBeNull();
  expect((await page.request.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("a provider sign-in fragment stores the token and clears the address bar", async ({ page }) => {
  await page.goto("/#linkError=discord");
  await expect(page.locator(".bowdle-toast")).toContainText("did not finish");
  expect(await page.evaluate(() => location.hash)).toBe("");
});
