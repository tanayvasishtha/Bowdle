import { expect, test, type Page } from "@playwright/test";
import { collectErrors, returningPlayer } from "./helpers.ts";

type Hooks = { locker: { look(): Record<string, string>; locker(): { ink: number; owned: string[]; loadout: Record<string, string> } | undefined } };
const hooks = (page: Page) => page.evaluate(() => {
  const test = (window as unknown as { __bowdleTest: Hooks }).__bowdleTest;
  return { look: test.locker.look(), locker: test.locker.locker() };
});

test.beforeEach(({ page }) => returningPlayer(page));

test("the locker previews, buys with Ink and equips", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=locker&test");
  await expect(page.getByTestId("locker-ink")).toHaveText("0 Ink", { timeout: 15_000 });
  await page.screenshot({ path: "test-results/qa/m11/locker-bows.png" });

  await page.getByRole("button", { name: "Outfits" }).click();
  await page.locator('[data-item="outfit.idol"]').click();
  expect((await hooks(page)).look.outfit).toBe("outfit.idol");
  await expect(page.locator('[data-item="outfit.idol"] button')).toHaveText("Web store only");
  await expect(page.locator('[data-item="outfit.ranger"] button')).toBeDisabled();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/qa/m11/locker-idol-preview.png" });

  const token = await page.evaluate(() => localStorage.getItem("bowdle.token"));
  const granted = await page.request.post("/api/dev/grant-ink", { headers: { Authorization: `Bearer ${token}` }, data: { ink: 1000 } });
  expect(granted.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("locker-ink")).toHaveText("1000 Ink", { timeout: 15_000 });
  await page.getByRole("button", { name: "Outfits" }).click();
  await page.locator('[data-item="outfit.ranger"] button').click();
  await expect(page.getByTestId("locker-ink")).toHaveText("500 Ink");
  await page.locator('[data-item="outfit.ranger"] button').click();
  await expect(page.locator('[data-item="outfit.ranger"] button')).toHaveText("Equipped");
  expect((await hooks(page)).locker?.loadout.outfit).toBe("outfit.ranger");
  await page.locator('[data-item="outfit.ranger"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/qa/m11/locker-ranger.png" });

  await page.getByRole("button", { name: "Bows" }).click();
  await page.locator('[data-item="bow.ember"]').click();
  await page.getByRole("button", { name: "Moon crew" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "test-results/qa/m11/locker-moon-ember.png" });

  await page.getByRole("button", { name: "Trails" }).click();
  await page.locator('[data-item="trail.river"]').click();
  await page.waitForFunction(() => (window as unknown as { __bowdleTest: { locker: { effects(): { trailPoints: number } } } }).__bowdleTest.locker.effects().trailPoints >= 4, undefined, { timeout: 10_000 });
  await page.evaluate(() => (window as unknown as { __bowdleTest: { locker: { freeze(): void } } }).__bowdleTest.locker.freeze());
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/qa/m11/locker-trail.png" });

  await page.getByRole("button", { name: "Kill effects" }).click();
  await page.locator('[data-item="effect.stars"]').click();
  await page.waitForFunction(() => (window as unknown as { __bowdleTest: { locker: { effects(): { bursts: number } } } }).__bowdleTest.locker.effects().bursts >= 1, undefined, { timeout: 10_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/qa/m11/locker-effect.png" });
  const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: { stats(): { drawCalls: number } } }).__bowdleTest.stats());
  expect(stats.drawCalls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});

test("the menu opens the locker", async ({ page }) => {
  await page.goto("/?scene=locker&test");
  await expect(page.getByTestId("locker")).toBeVisible();
});
