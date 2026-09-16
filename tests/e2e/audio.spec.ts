import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type AudioApi = { audioState(): { musicBus: number; layers: { pad: number; percussion: number; melody: number }; cues: number }; sessionId: string };
const audio = (page: Page) => page.evaluate(() => (window as unknown as { __bowdleTest: AudioApi }).__bowdleTest.audioState());

test("M switches the music bus, and an enemy shot nearby shows a sound indicator", async ({ page, browser }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("bowdle.settings.v1", JSON.stringify({ soundIndicators: true, musicVolume: 0.5 })));
  await page.goto(onlineUrl("map=sun-temple"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.locator("#game-canvas").click();
  expect((await audio(page)).musicBus).toBe(0.5);

  await page.keyboard.press("KeyM");
  await expect.poll(async () => (await audio(page)).musicBus).toBe(0);
  await page.keyboard.press("KeyM");
  await expect.poll(async () => (await audio(page)).musicBus).toBe(0.5);
  expect((await audio(page)).layers.pad).toBe(1);

  // A second browser context keeps both pages rendering at full rate.
  const peerContext = await browser.newContext();
  const peer = await peerContext.newPage();
  await peer.goto(onlineUrl("map=sun-temple"));
  await peer.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 10_000 }).not.toContain("DRAW IN");
  const before = (await audio(page)).cues;
  // The second player is on the other team; it shoots straight at the first player.
  const me = await page.evaluate(() => (window as unknown as { __bowdleTest: AudioApi }).__bowdleTest.sessionId);
  await peer.locator("#game-canvas").click();
  await peer.evaluate((target) => (window as unknown as { __bowdleTest: { aimAt(id: string): void } }).__bowdleTest.aimAt(target), me);
  await peer.mouse.down();
  // Hold until the draw is full; a loaded machine renders the second page slowly.
  await expect.poll(() => peer.evaluate(() => (window as unknown as { __bowdleTest: { drawMs(): number } }).__bowdleTest.drawMs()), { timeout: 10_000 }).toBeGreaterThanOrEqual(550);
  await peer.mouse.up();
  await expect.poll(async () => (await audio(page)).cues, { timeout: 8_000 }).toBeGreaterThan(before);
  await expect(page.locator("[data-testid=sound-cues] [data-cue=shot]").first()).toBeAttached();
  await page.screenshot({ path: "test-results/qa/g6/shot-cue.png" });
  await peerContext.close();
  expect(errors).toEqual([]);
});
