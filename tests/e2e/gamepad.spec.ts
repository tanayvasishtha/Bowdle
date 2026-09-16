import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl, returningPlayer } from "./helpers.ts";

type Fractions = Record<string, number> & { sunTint: number; moonTint: number };
type Hooks = {
  sessionId: string;
  players(): Array<{ id: string; x: number; z: number; yaw?: number }>;
  drawMs(): number;
  snapshot(): Fractions;
  cameraAt(x: number, y: number, z: number, lookX: number, lookY: number, lookZ: number): void;
};

/** A fake standard gamepad the test drives through window.__pad. */
async function mockPad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { axes: [0, 0, 0, 0], pressed: new Set<number>() };
    (window as unknown as { __pad: typeof state }).__pad = state;
    navigator.getGamepads = () => [{
      id: "Test pad", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), axes: state.axes,
      buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: state.pressed.has(index), touched: state.pressed.has(index), value: state.pressed.has(index) ? 1 : 0 })),
    } as unknown as Gamepad];
  });
}
const stick = (page: Page, axes: number[]) => page.evaluate((values) => { (window as unknown as { __pad: { axes: number[] } }).__pad.axes = values; }, axes);
const button = (page: Page, index: number, down: boolean) => page.evaluate(([at, pressed]) => {
  const set = (window as unknown as { __pad: { pressed: Set<number> } }).__pad.pressed;
  if (pressed) set.add(at as number); else set.delete(at as number);
}, [index, down] as const);
const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent ?? "");
/** Presses and releases a pad button, holding it long enough for a slow frame to see it. */
async function tap(page: Page, index: number): Promise<void> {
  await button(page, index, true); await page.waitForTimeout(250); await button(page, index, false); await page.waitForTimeout(250);
}
/** Holds D-pad down until focus moves, then releases long enough for the next press to count as new. */
async function focusNext(page: Page): Promise<string> {
  const before = await focused(page);
  await button(page, 13, true);
  await expect.poll(() => focused(page)).not.toBe(before);
  await button(page, 13, false);
  await page.waitForTimeout(300);
  return focused(page);
}
const hooks = (page: Page) => page.evaluate(() => {
  const test = (window as unknown as { __bowdleTest: Hooks }).__bowdleTest;
  return { me: test.players().find((player) => player.id === test.sessionId)!, drawMs: test.drawMs() };
});

test("a gamepad moves, looks, draws and opens the pause panel", async ({ page }) => {
  const errors = collectErrors(page);
  await mockPad(page);
  await page.goto(onlineUrl("map=canopy"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");
  const start = (await hooks(page)).me;

  await stick(page, [0, -1, 0, 0]);
  await expect.poll(async () => { const now = (await hooks(page)).me; return Math.hypot(now.x - start.x, now.z - start.z); }, { timeout: 15_000 }).toBeGreaterThan(2);
  await stick(page, [0, 0, 0.9, 0]);
  await expect.poll(async () => Math.abs(((await hooks(page)).me.yaw ?? 0) - (start.yaw ?? 0))).toBeGreaterThan(0.5);
  await stick(page, [0, 0, 0, 0]);

  await button(page, 7, true);
  await expect.poll(async () => (await hooks(page)).drawMs).toBeGreaterThan(200);
  await page.screenshot({ path: "test-results/qa/g7/pad-draw.png" });
  await button(page, 7, false);
  await expect.poll(async () => (await hooks(page)).drawMs).toBe(0);

  await button(page, 9, true);
  await expect(page.locator(".bowdle-pause")).toBeVisible();
  await button(page, 9, false);
  await button(page, 1, true);
  await expect(page.locator(".bowdle-pause")).toBeHidden();
  await button(page, 1, false);
  expect(errors).toEqual([]);
});

test("menus and settings work with a gamepad", async ({ page }) => {
  const errors = collectErrors(page);
  await returningPlayer(page);
  await mockPad(page);
  await page.goto("/");
  await expect(page.locator(".bowdle-menu")).toBeVisible();
  const labels: string[] = [];
  for (let press = 0; press < 3; press += 1) labels.push(await focusNext(page));
  expect(labels).toEqual(["Play", "Free for All", "Relic Run"]);
  // Walk down to Settings and open it with A.
  for (let press = 0; press < 12 && (await focused(page)) !== "Settings"; press += 1) await focusNext(page);
  await tap(page, 0);
  await expect(page.locator(".bowdle-settings")).toBeVisible();
  await page.screenshot({ path: "test-results/qa/g7/pad-settings.png" });
  await tap(page, 1);
  await expect(page.locator(".bowdle-settings")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("colorblind palettes change the team colors", async ({ page }) => {
  const errors = collectErrors(page);
  // Lineup layout from src/client/main.ts: Sun in front at z 0, Moon staggered behind at z -2.4.
  const sunX = -3.5 * 2.1, moonX = sunX + 1.05;
  const measure = async (palette: string): Promise<{ sunTint: number; moonTint: number }> => {
    await page.goto("/");
    await page.evaluate((name) => localStorage.setItem("bowdle.settings.v1", JSON.stringify({ teamPalette: name })), palette);
    await page.goto("/?scene=characters&test");
    await page.waitForFunction(() => "__bowdleTest" in window);
    const shot = async (x: number, z: number, lookZ: number): Promise<Fractions> => {
      await page.evaluate(([cx, cz, lz]) => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.cameraAt(cx!, 1.2, cz!, cx!, 1.0, lz!), [x, z, lookZ]);
      await page.waitForTimeout(150);
      return page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.snapshot());
    };
    const sun = await shot(sunX, 2.3, 0);
    const moon = await shot(moonX, -0.2, -2.4);
    await page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.cameraAt(-1, 1.6, 4.5, -1, 1.0, -1.2));
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/qa/g7/palette-${palette}.png` });
    return { sunTint: sun.sunTint, moonTint: moon.moonTint };
  };
  const standard = await measure("default");
  expect(standard.sunTint).toBeGreaterThan(0.02);
  expect(standard.moonTint).toBeGreaterThan(0.02);
  for (const palette of ["deuteranopia", "protanopia", "tritanopia"]) await measure(palette);
  // Tritanopia moves the Moon crew from indigo to teal, out of the indigo band, and the Sun crew from orange to rose.
  // Shading mixes some rose pixels back toward orange, so the Sun band only shrinks.
  const tritan = await measure("tritanopia");
  expect(tritan.moonTint).toBeLessThan(standard.moonTint * 0.5);
  expect(tritan.sunTint).toBeLessThan(standard.sunTint * 0.8);
  expect(errors).toEqual([]);
});
