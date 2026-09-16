import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("full draw headshot kills the 20 m practice target", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=camp&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const result = await page.evaluate(() => (window as unknown as Window & {
    __bowdleTest: { fireAt(targetId: string, drawMs: number): { headshot: boolean; killed: boolean } };
  }).__bowdleTest.fireAt("target-20", 600));
  expect(result).toMatchObject({ headshot: true, killed: true });
  await expect(page.locator("#hit-marker")).toContainText("HEADSHOT");
  await page.screenshot({ path: "test-results/qa/w6/camp-headshot.png", fullPage: true });
  const longShot = await page.evaluate(() => (window as unknown as {
    __bowdleTest: { fireAt(targetId: string, drawMs: number): { headshot: boolean; killed: boolean } };
  }).__bowdleTest.fireAt("target-45", 600));
  expect(longShot).toEqual({ headshot: true, killed: true, targetId: "target-45" });
  await expect(page.locator(".bowdle-practice-replay")).toBeVisible();
  await page.screenshot({ path: "test-results/qa/m6/practice-replay.png", fullPage: true });
  expect(errors).toEqual([]);
});
