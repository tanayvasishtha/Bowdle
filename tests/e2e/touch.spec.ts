import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

test.describe("N3 touch controls", () => {
  test("shows touch layout at a tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "maxTouchPoints", { get: () => 5 });
      const real = window.matchMedia.bind(window);
      window.matchMedia = ((query: string) => {
        if (query.includes("pointer: coarse") || query.includes("hover: none")) {
          return {
            matches: true, media: query, onchange: null,
            addListener() {}, removeListener() {},
            addEventListener() {}, removeEventListener() {},
            dispatchEvent() { return false; },
          };
        }
        return real(query);
      }) as typeof window.matchMedia;
      try {
        const key = "bowdle.settings.v1";
        const current = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
        localStorage.setItem(key, JSON.stringify({ ...current, touchControls: "on", touchLookSensitivity: 1 }));
      } catch { /* ignore */ }
    });
    const errors = collectErrors(page);
    await page.goto(onlineUrl("bots=0"));
    await expect(page.getByTestId("touch-controls")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("touch-stick")).toBeVisible();
    await expect(page.getByTestId("touch-fire")).toBeVisible();
    await expect(page.getByTestId("touch-look")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
