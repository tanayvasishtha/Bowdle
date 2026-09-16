import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type JournalSnapshot = Record<"parchment" | "parchmentShade" | "sky" | "sepia" | "sunWash" | "moonWash" | "gold" | "hazard" | "stone" | "carvedStone" | "wood" | "canopy" | "fern" | "earth" | "water" | "rope" | "canvas" | "foliageDark" | "legacyRuled" | "legacyInk", number>;

test("Expedition Journal renders watercolor on parchment", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=map&map=sun-temple&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.evaluate(() => (window as unknown as { __bowdleTest: { cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void } }).__bowdleTest.cameraAt(-29, 7, -7, 0, 7, 0));
  const fractions = await page.evaluate(() => (window as unknown as { __bowdleTest: { snapshot(): JournalSnapshot } }).__bowdleTest.snapshot());
  const washes = fractions.stone + fractions.carvedStone + fractions.wood + fractions.canopy + fractions.fern + fractions.earth + fractions.water + fractions.rope + fractions.gold + fractions.sunWash + fractions.moonWash + fractions.hazard + fractions.canvas + fractions.foliageDark;
  expect(fractions.parchment + fractions.sky).toBeGreaterThanOrEqual(0.35);
  expect(washes).toBeGreaterThanOrEqual(0.10);
  expect(fractions.sepia).toBeGreaterThanOrEqual(0.02);
  expect(fractions.legacyRuled + fractions.legacyInk).toBeLessThan(0.01);
  await page.screenshot({ path: "test-results/qa/w1/journal-map.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("Practice Camp uses the journal look", async ({ page }) => {
  const errors = collectErrors(page); await page.goto("/?scene=camp");
  await expect(page.locator("#game-canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/qa/w6/practice-camp.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("jungle map kit renders every traversal primitive", async ({ page }) => {
  const errors = collectErrors(page); await page.goto("/?scene=kit&test");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const canvas = page.locator("#game-canvas"); await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute("data-map-id", "kit");
  await expect(canvas).toHaveAttribute("data-map-features", "8");
  const fractions = await page.evaluate(() => (window as unknown as { __bowdleTest: { snapshot(): JournalSnapshot } }).__bowdleTest.snapshot());
  expect(fractions.earth + fractions.water + fractions.fern).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/qa/w2/map-kit.png", fullPage: true });
  expect(errors).toEqual([]);
});
