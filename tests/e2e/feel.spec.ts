import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type Feel = { fov: number; offsetY: number; offsetX: number; rollDeg: number; hurt: number; streaks: number };
type FeelApi = {
  sessionId: string;
  players(): Array<{ id: string }>;
  cameraFeel(): Feel;
  forceFeel(hurt: number, streaks: number): void;
  showHitConfirm(message: { target: string; damage: number; headshot: boolean }): void;
};
const feel = (page: Page): Promise<Feel> => page.evaluate(() => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.cameraFeel());

async function openMatch(page: Page, reduceMotion: boolean): Promise<void> {
  await page.goto("/");
  await page.evaluate((reduce) => localStorage.setItem("bowdle.settings.v1", JSON.stringify({ reduceMotion: reduce, fov: 90 })), reduceMotion);
  await page.goto(onlineUrl("map=canopy"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.locator("#game-canvas").click();
}

async function runAndJump(page: Page): Promise<{ maxBob: number; maxFov: number }> {
  let maxBob = 0, maxFov = 0;
  await page.keyboard.down("KeyW");
  for (let sample = 0; sample < 12; sample += 1) {
    const now = await feel(page);
    maxBob = Math.max(maxBob, Math.abs(now.offsetY)); maxFov = Math.max(maxFov, now.fov);
    await page.waitForTimeout(80);
  }
  // A slow software renderer can drop a short key press between input samples, so jump up to three times.
  for (let attempt = 0; attempt < 3 && maxFov <= 90.3; attempt += 1) {
    await page.keyboard.down("Space");
    await page.waitForTimeout(150);
    await page.keyboard.up("Space");
    for (let sample = 0; sample < 8; sample += 1) {
      const now = await feel(page);
      maxBob = Math.max(maxBob, Math.abs(now.offsetY)); maxFov = Math.max(maxFov, now.fov);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(500);
  }
  await page.keyboard.up("KeyW");
  return { maxBob, maxFov };
}

test("running bobs the camera and jumping kicks the field of view", async ({ page }) => {
  const errors = collectErrors(page);
  await openMatch(page, false);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 10_000 }).not.toContain("DRAW IN");
  const { maxBob, maxFov } = await runAndJump(page);
  expect(maxBob).toBeGreaterThan(0.003);
  expect(maxFov).toBeGreaterThan(90.3);
  await page.evaluate(() => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.forceFeel(0.6, 0.35));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/qa/g1/vignette-streaks.png" });
  expect(errors).toEqual([]);
});

test("reduce motion keeps the camera still", async ({ page }) => {
  await openMatch(page, true);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 10_000 }).not.toContain("DRAW IN");
  const { maxBob, maxFov } = await runAndJump(page);
  expect(maxBob).toBe(0);
  expect(maxFov).toBeLessThanOrEqual(90.01);
});

test("a hit shows a damage number over the target", async ({ browser }) => {
  const contextA = await browser.newContext(), contextB = await browser.newContext();
  const pageA = await contextA.newPage(), pageB = await contextB.newPage();
  await Promise.all([pageA.goto(onlineUrl("map=lost-river")), pageB.goto(onlineUrl("map=lost-river"))]);
  await Promise.all([pageA.waitForFunction(() => "__bowdleTest" in window), pageB.waitForFunction(() => "__bowdleTest" in window)]);
  const idB = await pageB.evaluate(() => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.sessionId);
  await pageA.waitForFunction((id) => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.players().some((player) => player.id === id), idB);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: FeelApi & { aimAt(id: string): void } }).__bowdleTest.aimAt(id), idB);
  await pageA.waitForTimeout(200);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.showHitConfirm({ target: id, damage: 42, headshot: true }), idB);
  await expect(pageA.getByTestId("damage-number")).toHaveText("42");
  await pageA.screenshot({ path: "test-results/qa/g1/damage-number.png" });
  await pageA.evaluate(() => { const saved = JSON.parse(localStorage.getItem("bowdle.settings.v1") ?? "{}"); localStorage.setItem("bowdle.settings.v1", JSON.stringify({ ...saved, damageNumbers: false })); });
  await pageA.waitForTimeout(700);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: FeelApi }).__bowdleTest.showHitConfirm({ target: id, damage: 17, headshot: false }), idB);
  await pageA.waitForTimeout(100);
  await expect(pageA.getByTestId("damage-number")).toHaveCount(0);
  await Promise.all([contextA.close(), contextB.close()]);
});
