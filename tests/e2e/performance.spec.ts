import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("first frame and launch map stay inside browser budgets", async ({ page }) => {
  const errors = collectErrors(page); await page.goto("/?scene=online&test&map=sun-temple");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const firstFrameMs = await page.evaluate(() => performance.now());
  const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: { stats(): { drawCalls: number; triangles: number; renderScale: number } } }).__bowdleTest.stats());
  console.info(JSON.stringify({ firstFrameMs, ...stats }));
  expect(firstFrameMs).toBeLessThan(3_000); expect(stats.drawCalls).toBeLessThanOrEqual(150); expect(stats.triangles).toBeLessThanOrEqual(300_000); expect(stats.renderScale).toBeGreaterThanOrEqual(0.6);
  await page.screenshot({ path: "test-results/qa/m9/performance.png", fullPage: true }); expect(errors).toEqual([]);
});
