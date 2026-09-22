import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl, returningPlayer } from "./helpers.ts";

test("the match HUD shows health and fills the draw meter while the bow is drawn", async ({ page }) => {
  const errors = collectErrors(page);
  await returningPlayer(page);
  await page.goto(`${onlineUrl("map=home-grove")}&mode=ffa`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect(page.getByTestId("health")).toContainText("100");
  const drawWidth = () => page.getByTestId("draw-meter").locator(".bowdle-vitals-fill").evaluate((fill) => parseFloat((fill as HTMLElement).style.width || "0"));
  expect(await drawWidth()).toBe(0);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 10_000 }).not.toContain("DRAW IN");
  await page.locator("#game-canvas").click();
  await page.mouse.down();
  await expect.poll(drawWidth, { timeout: 3_000 }).toBeGreaterThanOrEqual(90);
  // Overlays that are meant to be closed must not sit over the crosshair or in a corner.
  await expect(page.getByTestId("callout-wheel")).toBeHidden();
  await expect(page.getByTestId("scoreboard-menu")).toBeHidden();
  await page.screenshot({ path: "test-results/qa/fix4/hud-vitals.png" });
  await page.mouse.up();
  await expect.poll(drawWidth, { timeout: 3_000 }).toBe(0);
  expect(errors).toEqual([]);
});
