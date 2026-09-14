import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("full draw headshot kills the 20 m practice target", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=range&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const result = await page.evaluate(() => (window as unknown as Window & {
    __bowdleTest: { fireAt(targetId: string, drawMs: number): { headshot: boolean; killed: boolean } };
  }).__bowdleTest.fireAt("target-20", 600));
  expect(result).toMatchObject({ headshot: true, killed: true });
  await expect(page.locator("#hit-marker")).toContainText("HEADSHOT");
  await page.screenshot({ path: "test-results/qa/m3/practice-range.png", fullPage: true });
  expect(errors).toEqual([]);
});
