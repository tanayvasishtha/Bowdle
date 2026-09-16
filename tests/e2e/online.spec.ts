import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type TestApi = { players(): Array<{ id: string; x: number; y: number; z: number }>; sessionId: string; aimAt(id: string): void; drawMs(): number; killFeed(): string };
type AbilityTestApi = { aimAtGrapple(): void; grappleActive(): boolean; cloudCount(): number };

test("two online players see shared movement", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errorsA = collectErrors(pageA);
  const errorsB = collectErrors(pageB);
  await Promise.all([pageA.goto("/?scene=online&test&map=lost-river"), pageB.goto("/?scene=online&test&map=lost-river")]);
  await Promise.all([
    pageA.waitForFunction(() => "__bowdleTest" in window),
    pageB.waitForFunction(() => "__bowdleTest" in window),
  ]);
  const idA = await pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.sessionId);
  await pageB.waitForFunction((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().some((player) => player.id === id), idA);
  const before = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
  await Promise.all([pageA.keyboard.down("a"), pageB.keyboard.down("d")]);
  await expect.poll(async () => {
    const after = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
    return Math.hypot(after.x - before.x, after.z - before.z);
  }, { timeout: 8_000 }).toBeGreaterThan(5);
  await Promise.all([pageA.keyboard.up("a"), pageB.keyboard.up("d")]);
  const idB = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.sessionId);
  let previous = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players());
  let stableSamples = 0;
  await expect.poll(async () => {
    const current = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players());
    let movement = 0;
    for (const player of current) { const old = previous.find((candidate) => candidate.id === player.id); if (old) movement = Math.max(movement, Math.hypot(player.x - old.x, player.z - old.z)); }
    previous = current; stableSamples = movement < 0.02 ? stableSamples + 1 : 0; return stableSamples;
  }, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.aimAt(id), idB);
  await pageA.mouse.down();
  await pageA.waitForFunction(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.drawMs() >= 550);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.aimAt(id), idB);
  await pageA.mouse.up();
  await expect.poll(async () => pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.killFeed()), { timeout: 8_000 }).toContain("HEADSHOT");
  await expect.poll(async () => pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.killFeed()), { timeout: 8_000 }).toContain("HEADSHOT");
  await expect(pageB.locator(".bowdle-replay")).toBeVisible();
  await pageB.screenshot({ path: "test-results/qa/m6/arrow-cam.png", fullPage: true });
  await pageA.screenshot({ path: "test-results/qa/m4b/online-combat-a.png", fullPage: true });
  await pageB.screenshot({ path: "test-results/qa/m4b/online-combat-b.png", fullPage: true });
  expect([...errorsA, ...errorsB]).toEqual([]);
  await Promise.all([contextA.close(), contextB.close()]);
});

test("a solo online player gets a full match", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=online");
  await expect(page.locator(".bowdle-score")).toContainText("—", { timeout: 10_000 });
  await page.keyboard.down("Tab");
  await expect(page.locator(".bowdle-scoreboard")).toContainText("Doodle");
  await page.screenshot({ path: "test-results/qa/m5/full-match.png", fullPage: true });
  await page.screenshot({ path: "test-results/qa/w1/journal-online.png", fullPage: true });
  await page.keyboard.up("Tab");
  expect(errors).toEqual([]);
});

test("grapple and ink cloud are visible online", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?scene=online&test&map=lost-river");
  await page.waitForFunction(() => "__bowdleTest" in window);
  const peer = await page.context().newPage();
  const peerErrors = collectErrors(peer);
  await peer.goto("/?scene=online&test&map=lost-river");
  await peer.waitForFunction(() => "__bowdleTest" in window);
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");
  await page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.aimAtGrapple());
  await page.keyboard.down("e");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.grappleActive())).toBe(true);
  await page.keyboard.up("e");
  await page.screenshot({ path: "test-results/qa/m7/grapple-rope.png", fullPage: true });
  await page.keyboard.down("q");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.cloudCount()), { timeout: 4_000 }).toBeGreaterThan(0);
  await page.keyboard.up("q");
  await page.screenshot({ path: "test-results/qa/m7/ink-cloud.png", fullPage: true });
  await expect(page.locator("[data-testid=ability-cooldowns]")).toContainText("GRAPPLE");
  await expect(page.locator("[data-testid=ability-cooldowns]")).toContainText("INK CLOUD");
  expect([...errors, ...peerErrors]).toEqual([]);
  await peer.close();
});
