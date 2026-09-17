import { expect, test } from "@playwright/test";
import { collectErrors, returningPlayer } from "./helpers.ts";

const maps = ["sun-temple", "canopy", "lost-river", "sky-bridges", "sunken-ruins"] as const;
const modes = ["tdm", "ffa", "relic"] as const;

test.describe("g14 qa screenshots", () => {
  test.skip(!process.env.G14_SHOTS, "set G14_SHOTS=1 to capture mode×map screenshots");

  test("every PvP mode and launch map", async ({ page }) => {
    await returningPlayer(page);
    for (const mode of modes) for (const mapId of maps) {
      const errors = collectErrors(page);
      await page.goto(`/?scene=online&test&map=${mapId}&mode=${mode}&room=g14-${mode}-${mapId}`);
      await page.waitForFunction(() => "__bowdleTest" in window, undefined, { timeout: 20_000 });
      await expect(page.locator("#game-canvas")).toHaveAttribute("data-map-id", mapId, { timeout: 20_000 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/qa/g14/${mode}-${mapId}.png`, fullPage: true });
      expect(errors).toEqual([]);
    }
  });
});
