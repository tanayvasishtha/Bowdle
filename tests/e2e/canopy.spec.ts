import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type CameraApi = { cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void; stats(): { drawCalls: number; triangles: number } };

test("Canopy Village renders four vertical combat views within budget", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=map&map=canopy&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toHaveAttribute("data-map-id", "canopy");
  const views = [
    { name: "spawn-tree", camera: [-31, 4, -7, -15, 5, 0] },
    { name: "high-ring", camera: [0, 12, -11, 0, 8, 0] },
    { name: "zip", camera: [-9, 8, 9, -15, 5, 13] },
    { name: "grass", camera: [-17, 1.2, 9, 0, 5, 0] },
  ] as const;
  for (const view of views) {
    await page.evaluate((camera) => (window as unknown as { __bowdleTest: CameraApi }).__bowdleTest.cameraAt(camera[0]!, camera[1]!, camera[2]!, camera[3]!, camera[4]!, camera[5]!), view.camera);
    const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: CameraApi }).__bowdleTest.stats());
    expect(stats.drawCalls).toBeLessThanOrEqual(150);
    await page.screenshot({ path: `test-results/qa/w5/${view.name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
