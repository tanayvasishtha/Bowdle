import { expect, test, type Page } from "@playwright/test";
import { collectErrors, onlineUrl, returningPlayer } from "./helpers.ts";

type RelicState = { mode: string; home: boolean; carrier: string; carrying: boolean; relicDrawn: boolean };
type Hooks = { relicState(): RelicState; aimAtRelic(): void; players(): Array<{ id: string; team: number }>; sessionId: string };
const hooks = <T>(page: Page, read: (api: Hooks) => T) => page.evaluate(`(${read.toString()})(window.__bowdleTest)`) as Promise<T>;

test("a party leader picks a supported mode, and Free for All remains a direct match route", async ({ page }) => {
  const errors = collectErrors(page);
  await returningPlayer(page);
  await page.goto("/?scene=party&test");
  await page.screenshot({ path: "test-results/qa/g8/party-mode.png" });
  await expect(page.locator(".bowdle-party select[data-field=mode] option")).toHaveText(["Quick Play", "Free for All", "Relic Run", "Village Defense"]);
  await page.locator(".bowdle-party select[data-field=mode]").selectOption("relic");
  await page.locator(".bowdle-party [data-action=start]").click();
  await page.waitForURL(/scene=online&party=[A-Z0-9]+&mode=relic/);
  await page.waitForFunction(() => "__bowdleTest" in window || document.querySelector(".bowdle-timer") !== null, undefined, { timeout: 20_000 });
  await page.goto(`${onlineUrl("map=wild-crossing")}&mode=ffa`);
  await expect(page.locator(".bowdle-score")).toContainText("YOU", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("Free for All shows no teams and everyone in a neutral outfit", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=lost-river")}&mode=ffa`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  const peer = await page.context().newPage();
  await peer.goto(`${onlineUrl("map=lost-river")}&mode=ffa`);
  await peer.waitForFunction(() => "__bowdleTest" in window);
  await page.bringToFront();
  await expect(page.locator(".bowdle-score")).toContainText("YOU 0");
  const teams = await hooks(page, (api) => api.players().map((player) => player.team));
  expect(new Set(teams).size).toBe(teams.length);
  const other = await hooks(page, (api) => api.players().find((player) => player.id !== api.sessionId)!.id);
  await page.evaluate((id) => (window as unknown as { __bowdleTest: { aimAt(id: string): void } }).__bowdleTest.aimAt(id), other);
  await page.waitForTimeout(300);
  await expect(page.locator(".bowdle-team-symbol:visible").filter({ hasText: "◯" })).toHaveCount(1);
  await page.screenshot({ path: "test-results/qa/g8/ffa.png" });
  await page.keyboard.down("Tab");
  await expect(page.locator(".bowdle-scoreboard, [class*=scoreboard]").first()).toContainText("FREE FOR ALL");
  await page.keyboard.up("Tab");
  expect(errors).toEqual([]);
});

test("Relic Run draws the relic at home with an objective marker", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(`${onlineUrl("map=sun-temple")}&mode=relic`);
  await page.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(() => hooks(page, (api) => api.relicState())).toMatchObject({ mode: "relic", home: true, carrier: "", relicDrawn: true });
  await hooks(page, (api) => api.aimAtRelic());
  await expect(page.locator("[data-testid=objective]")).toBeVisible();
  await expect(page.locator(".bowdle-score")).toContainText("◆");
  await page.screenshot({ path: "test-results/qa/g8/relic.png" });
  expect(errors).toEqual([]);
});
