import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

test("an online join renders every launch map within budget", async ({ page }) => {
  for (const mapId of ["sun-temple", "canopy", "lost-river"]) {
    const errors = collectErrors(page);
    await page.goto(onlineUrl(`map=${mapId}`));
    const canvas = page.locator("#game-canvas");
    await expect(canvas).toHaveAttribute("data-map-id", mapId);
    await page.waitForFunction(() => "__bowdleTest" in window);
    const drawCalls = await page.evaluate(() => (window as unknown as { __bowdleTest: { stats(): { drawCalls: number } } }).__bowdleTest.stats().drawCalls);
    expect(drawCalls).toBeLessThanOrEqual(150);
    await page.screenshot({ path: `test-results/qa/w6/${mapId}.png`, fullPage: true });
    expect(errors).toEqual([]);
  }
});
