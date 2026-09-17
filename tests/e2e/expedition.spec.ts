import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl, returningPlayer } from "./helpers.ts";

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

test("the menu offers Expedition and a checkpoint start to a returning player", async ({ page }) => {
  const errors = collectErrors(page);
  await returningPlayer(page);
  const withBest = async (route: import("@playwright/test").Route): Promise<void> => {
    const response = await route.fetch();
    const body = await response.json() as { profile?: { expeditionBest?: number }; expeditionBest?: number };
    if (body.profile) body.profile.expeditionBest = 12; else body.expeditionBest = 12;
    await route.fulfill({ response, json: body });
  };
  await page.route("**/api/auth/guest", withBest);
  await page.route("**/api/profile", withBest);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("bowdle.name", "Warden"));
  await page.getByRole("button", { name: "Expedition" }).click();
  const card = page.getByTestId("expedition-start");
  // The first account request can be slow while the dev database wakes up.
  await expect(card.getByRole("button", { name: "Start after wave 10" })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("button", { name: "Start at wave 1" })).toBeVisible();
  await page.screenshot({ path: "test-results/qa/g9/start.png" });
  await card.getByRole("button", { name: "Start after wave 10" }).click();
  await page.waitForURL(/scene=online&mode=expedition&checkpoint=1$/);
  expect(errors).toEqual([]);
});

test("wave 1 sends beetles at the camp, drawn instanced, with the wave line", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=sun-temple")}&mode=expedition`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.getByTestId("wave")).toContainText("EXPEDITION");
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
  await page.goto(`${onlineUrl("map=sun-temple")}&mode=expedition&startWave=4`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(() => hooks(page, (api) => api.expedition().drawn.colossus ?? 0), { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId("wave")).toContainText("WAVE 5");
  await expect(page.getByTestId("boss-bar")).toBeVisible();
  await expect(page.getByTestId("boss-bar")).toContainText("TEMPLE COLOSSUS");
  await lookAtCreature(page, "colossus", 13, 4, 2.4);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/qa/g9/boss.png" });
  expect((await hooks(page, (api) => api.stats())).drawCalls).toBeLessThanOrEqual(150);
  expect(errors).toEqual([]);
});
