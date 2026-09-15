import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type CameraApi = { cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void; stats(): { drawCalls: number; triangles: number } };

test("Sun Temple renders four landmark views within budget", async ({ page }) => {
  const errors = collectErrors(page); await page.goto("/?scene=map&map=sun-temple&test"); await page.waitForFunction(() => "__bowdleTest" in window);
  const canvas = page.locator("#game-canvas"); await expect(canvas).toHaveAttribute("data-map-id", "sun-temple");
  const views = [
    { name: "spawn", camera: [-29, 4, -7, 0, 2, 0] },
    { name: "altar", camera: [0, 10, -12, 0, 3, 0] },
    { name: "tunnel", camera: [-9, -0.7, 0, 2, -1, 0] },
    { name: "courtyard", camera: [-24, 5, -23, -14, 1, -14] },
  ] as const;
  for (const view of views) {
    await page.evaluate((camera) => (window as unknown as { __bowdleTest: CameraApi }).__bowdleTest.cameraAt(camera[0]!, camera[1]!, camera[2]!, camera[3]!, camera[4]!, camera[5]!), view.camera);
    const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: CameraApi }).__bowdleTest.stats()); expect(stats.drawCalls).toBeLessThanOrEqual(150);
    await page.screenshot({ path: `test-results/qa/w4/${view.name}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
