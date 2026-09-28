import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

async function forceTouch(page: Page): Promise<void> {
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
}

/** No overlap between the ability panel, the quiver strip, the server-ping readout and the three touch pads, which share their bottom corners. */
async function expectNoHudOverlap(page: Page): Promise<void> {
  // The ping line only shows once a reading has come back; force one so its position is checkable like the others.
  await page.waitForSelector('[data-testid="region-ping"]', { state: "attached" });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="region-ping"]')!.style.display = "block");
  const overlaps = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
    const collide = (a: DOMRect, b: DOMRect) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const abilities = rect(".bowdle-abilities"), quiver = rect(".bowdle-quiver"), ping = rect('[data-testid="region-ping"]');
    const stick = rect("[data-testid=touch-stick]"), look = rect("[data-testid=touch-look]"), fire = rect("[data-testid=touch-fire]");
    return {
      abilitiesVsStick: collide(abilities, stick), abilitiesVsQuiver: collide(abilities, quiver),
      quiverVsLook: collide(quiver, look), quiverVsFire: collide(quiver, fire),
      pingVsLook: collide(ping, look), pingVsFire: collide(ping, fire),
    };
  });
  expect(overlaps).toEqual({ abilitiesVsStick: false, abilitiesVsQuiver: false, quiverVsLook: false, quiverVsFire: false, pingVsLook: false, pingVsFire: false });
}

test.describe("N3 touch controls", () => {
  test("shows touch layout at a tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    await forceTouch(page);
    const errors = collectErrors(page);
    await page.goto(onlineUrl("bots=0"));
    await expect(page.getByTestId("touch-controls")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("touch-stick")).toBeVisible();
    await expect(page.getByTestId("touch-fire")).toBeVisible();
    await expect(page.getByTestId("touch-look")).toBeVisible();
    await expectNoHudOverlap(page);
    expect(errors).toEqual([]);
  });

  test("the ability panel and quiver strip clear the touch pads at phone width", async ({ page }) => {
    // A narrow phone is where the ability panel and quiver strip (bottom-left and bottom-centre on desktop) first
    // run out of room next to the touch stick, look pad and fire button, which sit in the same bottom corners.
    await page.setViewportSize({ width: 375, height: 812 });
    await forceTouch(page);
    const errors = collectErrors(page);
    await page.goto(onlineUrl("bots=0"));
    await expect(page.getByTestId("touch-controls")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("ability-cooldowns")).toBeVisible();
    await expect(page.getByTestId("quiver")).toBeVisible();
    await expectNoHudOverlap(page);
    expect(errors).toEqual([]);
  });
});
