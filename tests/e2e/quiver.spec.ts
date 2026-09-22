import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type QuiverApi = {
  sessionId: string;
  quiver(): { slot: string; charges: number; tetherCooldownMs: number; tethers: number };
  showSwat(message: { swatter: string; shooter: string; x: number; y: number; z: number }): void;
};
const quiver = (page: Page) => page.evaluate(() => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.quiver());
const selected = (page: Page) => page.locator("[data-testid=quiver] [data-selected=true]");

test("the launch quiver keeps special arrows unavailable and still shows a swat", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=lost-river"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.locator("#game-canvas").click();
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");

  await expect(selected(page)).toHaveAttribute("data-slot", "arrow");
  await page.keyboard.press("Digit2");
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await quiver(page)).slot).toBe("arrow");
  await expect(page.locator("[data-testid=quiver] > div")).toHaveCount(1);

  const me = await page.evaluate(() => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.sessionId);
  await page.evaluate((swatter) => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.showSwat({ swatter, shooter: "someone", x: 0, y: 1, z: 0 }), me);
  await expect(page.locator(".bowdle-moment")).toContainText("SWATTED");
  await expect(page.locator("[data-testid=xp-ticker]")).toContainText("Swatted");
  await page.screenshot({ path: "test-results/qa/g4/quiver-swat.png" });
  expect(errors).toEqual([]);
});

test("the practice camp shows the launch quiver strip", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=camp");
  await expect(page.locator("[data-testid=quiver] > div")).toHaveCount(1);
  await page.locator("#game-canvas").click();
  await page.keyboard.press("Digit3");
  await expect(page.locator("[data-testid=quiver] [data-selected=true]")).toHaveAttribute("data-slot", "arrow");
  await page.screenshot({ path: "test-results/qa/g4/camp-quiver.png" });
  expect(errors).toEqual([]);
});
