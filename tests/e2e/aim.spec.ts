import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl, returningPlayer } from "./helpers.ts";

type TestApi = { setLookForTest(yaw: number, pitch?: number): void };

// Windows laptops commonly run at 125%. The canvas used to show at its pixel size there, larger than the window,
// so the view was zoomed and its centre sat right of and below the crosshair.
test.use({ deviceScaleFactor: 1.25 });

test("on a scaled display the view fills the window and the aim dot shows while the bow is drawn", async ({ page }) => {
  const errors = collectErrors(page);
  await returningPlayer(page);
  await page.goto(`${onlineUrl("map=home-grove")}&mode=ffa`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  const viewport = page.viewportSize()!;
  expect(await page.locator("#game-canvas").boundingBox()).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 10_000 }).not.toContain("DRAW IN");
  const dot = page.getByTestId("aim-dot");
  await expect(dot).toBeHidden();
  await page.locator("#game-canvas").click();
  // Look a little down so the arrow would land on the ground in front.
  await page.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.setLookForTest(0, -0.25));
  await page.mouse.down();
  await expect(dot).toBeVisible({ timeout: 5_000 });
  await page.mouse.up();
  await expect(dot).toBeHidden({ timeout: 5_000 });
  expect(errors).toEqual([]);
});
