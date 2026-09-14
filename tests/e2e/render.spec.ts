import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("Notebook Page renders as ink on paper", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=map&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const fractions = await page.evaluate(() => (window as unknown as Window & {
    __bowdleTest: { snapshot(): { paper: number; ink: number } };
  }).__bowdleTest.snapshot());
  expect(fractions.paper).toBeGreaterThanOrEqual(0.4);
  expect(fractions.ink).toBeGreaterThanOrEqual(0.02);
  await page.screenshot({ path: "test-results/qa/m1/notebook-map.png", fullPage: true });
  await page.screenshot({ path: "test-results/qa/m2/notebook-movement.png", fullPage: true });
  expect(errors).toEqual([]);
});
