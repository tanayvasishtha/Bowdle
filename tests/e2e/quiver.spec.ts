import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type QuiverApi = {
  sessionId: string;
  quiver(): { slot: string; charges: number; tetherCooldownMs: number; tethers: number };
  showSwat(message: { swatter: string; shooter: string; x: number; y: number; z: number }): void;
};
const quiver = (page: Page) => page.evaluate(() => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.quiver());
const selected = (page: Page) => page.locator("[data-testid=quiver] [data-selected=true]");

test("arrows switch with number keys and the wheel, scatter spends a charge, and a swat shows", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=online&test&map=lost-river");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.locator("#game-canvas").click();
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");

  await expect(selected(page)).toHaveAttribute("data-slot", "arrow");
  await page.keyboard.down("Digit2");
  await expect.poll(async () => (await quiver(page)).slot).toBe("scatter");
  await page.keyboard.up("Digit2");
  await expect(selected(page)).toHaveAttribute("data-slot", "scatter");
  await expect(page.locator("[data-testid=quiver] [data-slot=scatter]")).toContainText("●●●");

  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.screenshot({ path: "test-results/qa/g4/scatter-drawn.png" });
  await page.mouse.up();
  await expect.poll(async () => (await quiver(page)).charges).toBe(2);
  await expect(page.locator("[data-testid=quiver] [data-slot=scatter]")).toContainText("●●○");

  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await quiver(page)).slot).toBe("tether");
  await expect(selected(page)).toHaveAttribute("data-slot", "tether");
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await quiver(page)).slot).toBe("scatter");
  await page.keyboard.down("Digit1");
  await expect.poll(async () => (await quiver(page)).slot).toBe("arrow");
  await page.keyboard.up("Digit1");

  const me = await page.evaluate(() => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.sessionId);
  await page.evaluate((swatter) => (window as unknown as { __bowdleTest: QuiverApi }).__bowdleTest.showSwat({ swatter, shooter: "someone", x: 0, y: 1, z: 0 }), me);
  await expect(page.locator(".bowdle-moment")).toContainText("SWATTED");
  await expect(page.locator("[data-testid=xp-ticker]")).toContainText("Swatted");
  await page.screenshot({ path: "test-results/qa/g4/quiver-swat.png" });
  expect(errors).toEqual([]);
});

test("the practice camp shows the quiver strip", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=camp");
  await expect(page.locator("[data-testid=quiver] > div")).toHaveCount(3);
  await page.locator("#game-canvas").click();
  await page.keyboard.down("Digit3");
  await expect(page.locator("[data-testid=quiver] [data-selected=true]")).toHaveAttribute("data-slot", "tether");
  await page.keyboard.up("Digit3");
  await page.screenshot({ path: "test-results/qa/g4/camp-quiver.png" });
  expect(errors).toEqual([]);
});
