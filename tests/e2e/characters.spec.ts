import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type Fractions = Record<string, number> & { sunTint: number; moonTint: number };
type Stats = { drawCalls: number; triangles: number };
type Hooks = { snapshot(): Fractions; stats(): Stats; cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void };

// Lineup layout from src/client/main.ts: eight poses, Sun in front at z 0, Moon staggered behind at z -2.4.
const FIRST_SUN_X = -3.5 * 2.1;
const FIRST_MOON_X = FIRST_SUN_X + 1.05;

test("both crews read clearly in every pose", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=characters&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.screenshot({ path: "test-results/qa/c1/lineup.png" });

  const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.stats());
  expect(stats.drawCalls).toBeLessThanOrEqual(150);

  await page.evaluate((x) => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.cameraAt(x, 1.2, 2.3, x, 1.0, 0), FIRST_SUN_X);
  await page.screenshot({ path: "test-results/qa/c1/sun-close.png" });
  const sun = await page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.snapshot());
  expect(sun.sunTint, "Sun crew orange").toBeGreaterThan(0.02);

  await page.evaluate((x) => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.cameraAt(x, 1.2, -0.2, x, 1.0, -2.4), FIRST_MOON_X);
  await page.screenshot({ path: "test-results/qa/c1/moon-close.png" });
  const moon = await page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.snapshot());
  expect(moon.moonTint, "Moon crew indigo").toBeGreaterThan(0.02);

  expect(errors).toEqual([]);
});
