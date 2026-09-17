import { expect, test } from "@playwright/test";
import { collectErrors, returningPlayer } from "./helpers.ts";

const maps = ["sun-temple", "canopy", "lost-river", "sky-bridges", "sunken-ruins"] as const;
const modes = ["tdm", "ffa", "relic"] as const;
const shot = !!process.env.G14_SHOTS;

test.describe("g14 qa screenshots", () => {
  test("every PvP mode and launch map loads without errors", async ({ page }) => {
    await returningPlayer(page);
    const errors = collectErrors(page);
    const sample = shot
      ? modes.flatMap((mode) => maps.map((mapId) => [mode, mapId] as const))
      : ([["tdm", "sun-temple"], ["ffa", "canopy"], ["relic", "lost-river"], ["tdm", "sky-bridges"], ["expedition", "sun-temple"]] as const);
    for (const [mode, mapId] of sample) {
      await page.goto(`/?scene=online&test&map=${mapId}&mode=${mode}&room=g14-${mode}-${mapId}-${Date.now()}`);
      await page.waitForFunction(() => "__bowdleTest" in window, undefined, { timeout: 20_000 });
      await expect(page.locator("#game-canvas")).toHaveAttribute("data-map-id", mapId, { timeout: 20_000 });
      if (shot) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `test-results/qa/g14/${mode}-${mapId}.png`, fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
});
