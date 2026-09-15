import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("procedural prop gallery stays inside its render budget", async ({ page }) => {
  const errors = collectErrors(page); await page.goto("/?scene=props&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: { stats(): { drawCalls: number; triangles: number } } }).__bowdleTest.stats());
  expect(stats.drawCalls).toBeLessThanOrEqual(150);
  expect(stats.triangles).toBeLessThanOrEqual(300_000);
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-map-id", "props");
  await page.screenshot({ path: "test-results/qa/w3/prop-gallery.png", fullPage: true });
  expect(errors).toEqual([]);
});
