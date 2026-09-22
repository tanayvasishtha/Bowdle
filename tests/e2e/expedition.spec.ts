import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type ExpeditionView = { mode: string; phase: string; wave: number; runPhase: string; creatures: Array<{ kind: string; x: number; y: number; z: number; yaw: number }>; drawn: Record<string, number> };
type Hooks = { expedition(): ExpeditionView; stats(): { drawCalls: number }; cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void };
const hooks = <T>(page: Page, read: (api: Hooks) => T) => page.evaluate(`(${read.toString()})(window.__bowdleTest)`) as Promise<T>;

/** Puts the test camera a few meters in front of a creature of this kind, looking at it. */
async function lookAtCreature(page: Page, kind: string, distance: number, height: number, lookHeight: number): Promise<void> {
  await page.evaluate(([wanted, back, up, aim]) => {
    const api = (window as unknown as { __bowdleTest: Hooks }).__bowdleTest;
    const creature = api.expedition().creatures.find((entry) => entry.kind === wanted);
    if (!creature) return;
    // Creatures face -Z in their own space; stand in front of the face.
    const x = creature.x - Math.sin(creature.yaw) * back, z = creature.z - Math.cos(creature.yaw) * back;
    api.cameraAt(x, creature.y + up, z, creature.x, creature.y + aim, creature.z);
  }, [kind, distance, height, lookHeight] as const);
}

test("Village Defense starts on Home Grove", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=home-grove")}&mode=expedition`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-map-id", "home-grove");
  await expect(page.getByTestId("totem-bar")).toBeVisible();
  await page.screenshot({ path: "test-results/qa/c1/home-grove-totem.png" });
  expect(errors).toEqual([]);
});

test("wave 1 sends beetles at the camp, drawn instanced, with the wave line", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=home-grove")}&mode=expedition`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.getByTestId("wave")).toContainText("VILLAGE DEFENSE");
  await expect.poll(() => hooks(page, (api) => api.expedition()), { timeout: 20_000 }).toMatchObject({ mode: "expedition", phase: "live", wave: 1, runPhase: "fight" });
  await expect.poll(() => hooks(page, (api) => api.expedition().drawn.beetle ?? 0), { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("wave")).toContainText("WAVE 1");
  await expect(page.getByTestId("wave")).toContainText("left");
  // Every creature in the state is drawn; poll, since one may spawn between the frame and the read.
  await expect.poll(() => hooks(page, (api) => { const view = api.expedition(); return view.drawn.beetle === view.creatures.length && view.creatures.every((creature) => creature.kind === "beetle"); })).toBe(true);
  await lookAtCreature(page, "beetle", 3.5, 2.2, 0.3);
  // Beetles run fast; shoot right after the camera moves.
  await page.waitForTimeout(50);
  await page.screenshot({ path: "test-results/qa/g9/wave1.png" });
  expect((await hooks(page, (api) => api.stats())).drawCalls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});

test("a boss wave wakes the Temple Colossus with its health bar", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=home-grove")}&mode=expedition&startWave=4`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(() => hooks(page, (api) => api.expedition().drawn.colossus ?? 0), { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId("wave")).toContainText("WAVE 5");
  await expect(page.getByTestId("boss-bar")).toBeVisible();
  await expect(page.getByTestId("boss-bar")).toContainText("CHIEF");
  await lookAtCreature(page, "colossus", 13, 4, 2.4);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/qa/g9/boss.png" });
  expect((await hooks(page, (api) => api.stats())).drawCalls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});

test("wave 5 draws a mire bloom", async ({ page }) => {
  const errors = collectErrors(page);
  // Seed 5 makes a mire the first creature of wave 6, so the check does not depend on luck.
  await page.goto(`${onlineUrl("map=home-grove")}&mode=expedition&startWave=5&seed=5`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(() => hooks(page, (api) => api.expedition().drawn.mire ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await lookAtCreature(page, "mire", 4, 2.0, 0.5);
  await page.screenshot({ path: "test-results/qa/n1/mire.png" });
  expect(errors).toEqual([]);
});

test("wave 7 draws a mycelium tender", async ({ page }) => {
  const errors = collectErrors(page);
  // Seed 4 makes a tender the first creature of wave 8, so the check does not depend on luck.
  await page.goto(`${onlineUrl("map=home-grove")}&mode=expedition&startWave=7&seed=4`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(() => hooks(page, (api) => api.expedition().drawn.tender ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await lookAtCreature(page, "tender", 4, 2.2, 0.8);
  await page.screenshot({ path: "test-results/qa/n1/tender.png" });
  expect(errors).toEqual([]);
});
