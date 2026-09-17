import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type SocialApi = {
  openPingWheel(): void;
  pingWheelOpen(): boolean;
  forcePing(kind?: string): void;
  pingMarkerCount(): number;
  showAfkPrompt(secondsLeft?: number): void;
  afkPromptVisible(): boolean;
  startSpectate(killerId: string, killerName?: string): void;
  isSpectating(): boolean;
  setPlayOfTheMatch(playOf: { killerId: string; victimId: string; distance: number; streak: number; kind: "longShot" | "streak" }): void;
  showEndScreen(): void;
  sessionId: string;
};

test("ping wheel, spectate overlay, AFK prompt and play of the match", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=lost-river"));
  await page.waitForFunction(() => "__bowdleTest" in window);

  await page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.openPingWheel());
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.pingWheelOpen())).toBe(true);
  await expect(page.getByTestId("callout-wheel")).toBeVisible();

  await page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.forcePing("location"));
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.pingMarkerCount()), { timeout: 5_000 }).toBeGreaterThan(0);

  const self = await page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.sessionId);
  await page.evaluate((id) => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.startSpectate(id, "Rival"), self);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.isSpectating())).toBe(true);
  await expect(page.locator(".bowdle-replay")).toBeVisible();

  await page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.showAfkPrompt(25));
  await expect(page.getByTestId("afk-prompt")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest.afkPromptVisible())).toBe(true);

  await page.evaluate((id) => {
    const api = (window as unknown as { __bowdleTest: SocialApi }).__bowdleTest;
    api.setPlayOfTheMatch({ killerId: id, victimId: id, distance: 42, streak: 3, kind: "longShot" });
    api.showEndScreen();
  }, self);
  await expect(page.getByTestId("play-of-the-match")).toContainText("Play of the Match");
  await expect(page.getByTestId("play-of-the-match")).toContainText("42");

  expect(errors).toEqual([]);
});
