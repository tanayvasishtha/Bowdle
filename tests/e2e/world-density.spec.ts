import { expect, test } from "@playwright/test";
import { campMap } from "../../src/shared/maps/camp.ts";
import { matchMaps } from "../../src/shared/maps/registry.ts";
import { collectErrors } from "./helpers.ts";

type Fractions = Record<string, number>;
type Stats = { drawCalls: number; triangles: number; renderScale: number };

const WASH_KEYS = ["stone", "carvedStone", "wood", "canopy", "fern", "earth", "water", "rope", "gold", "canvas", "foliageDark", "sunWash", "moonWash", "hazard"];

const views = [
  { map: "sun-temple", camera: [-29, 1.7, -6, 6, 3, 2] },
  { map: "canopy", camera: [-24, 1.7, -6, 0, 6, 0] },
  { map: "lost-river", camera: [-30, 1.7, 0, 0, 3, 6] },
] as const;

for (const view of views) {
  test(`${view.map} reads as a drawn jungle`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/?scene=map&map=${view.map}&test`);
    await page.waitForFunction(() => "__bowdleTest" in window);
    await page.evaluate((camera) => {
      const hooks = (window as unknown as { __bowdleTest: { cameraAt(...args: number[]): void } }).__bowdleTest;
      hooks.cameraAt(...camera);
    }, [...view.camera]);

    await page.screenshot({ path: `test-results/qa/w7/${view.map}.png` });
    const fractions = await page.evaluate(() => (window as unknown as { __bowdleTest: { snapshot(): Fractions } }).__bowdleTest.snapshot());
    const washes = WASH_KEYS.reduce((total, key) => total + (fractions[key] ?? 0), 0);
    expect(fractions.parchment! + fractions.sky!, "background").toBeLessThanOrEqual(0.45);
    expect(washes, "washes").toBeGreaterThanOrEqual(0.25);
    const ink = ["sepia", "canopyInk", "waterInk", "foliageInk"].reduce((total, key) => total + (fractions[key] ?? 0), 0);
    expect(ink, "ink").toBeGreaterThanOrEqual(0.03);

    const stats = await page.evaluate(() => (window as unknown as { __bowdleTest: { stats(): Stats } }).__bowdleTest.stats());
    expect(stats.drawCalls).toBeLessThanOrEqual(150);
    expect(stats.triangles).toBeLessThanOrEqual(300_000);

    expect(errors).toEqual([]);
  });
}

test("every launch map carries enough scenery", () => {
  for (const map of [...matchMaps, campMap]) {
    expect(map.props.length, `${map.id} props`).toBeGreaterThanOrEqual(120);
    expect(map.boxes.some((box) => box.id.startsWith("boundary") && !box.tags.includes("invisible")), `${map.id} boundary slab`).toBe(false);
  }
});
