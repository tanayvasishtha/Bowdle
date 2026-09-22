import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

type TestApi = { players(): Array<{ id: string; x: number; y: number; z: number }>; sessionId: string; aimAt(id: string): void; drawMs(): number; spawnProtectMsForTest(): number; releaseForTest(): void; setLookForTest(yaw: number, pitch?: number): void; killFeed(): string };
type AbilityTestApi = { aimAtGrapple(minDistance?: number): void; grappleActive(): boolean; cloudCount(): number };

test("two online players see shared movement", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errorsA = collectErrors(pageA);
  const errorsB = collectErrors(pageB);
  await Promise.all([pageA.goto(onlineUrl("map=lost-river")), pageB.goto(onlineUrl("map=lost-river"))]);
  await Promise.all([
    pageA.waitForFunction(() => "__bowdleTest" in window),
    pageB.waitForFunction(() => "__bowdleTest" in window),
  ]);
  await pageA.bringToFront();
  const idA = await pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.sessionId);
  const idB = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.sessionId);
  await pageB.waitForFunction((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().some((player) => player.id === id), idA);
  const before = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
  await pageA.keyboard.down("d");
  await pageA.waitForFunction((arg: unknown) => {
    const [id, x, z] = arg as [string, number, number];
    const player = (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((candidate) => candidate.id === id);
    if (!player || Math.hypot(player.x - x, player.z - z) <= 5) return false;
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
    return true;
  }, [idA, before.x, before.z]);
  await pageA.keyboard.up("d");
  await pageA.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" })));
  await pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.releaseForTest());
  await expect.poll(async () => {
    const after = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
    return Math.hypot(after.x - before.x, after.z - before.z);
  }, { timeout: 8_000 }).toBeGreaterThan(5);
  const shooterAfter = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
  const movedDistance = Math.hypot(shooterAfter.x - before.x, shooterAfter.z - before.z);
  const targetBefore = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idB);
  const initialDistance = Math.hypot(targetBefore.x - before.x, targetBefore.z - before.z);
  await pageB.bringToFront();
  const movementYaw = Math.atan2(-(shooterAfter.x - before.x), -(shooterAfter.z - before.z));
  await pageB.evaluate((arg) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.setLookForTest(arg), movementYaw);
  await pageB.keyboard.down("w");
  await pageB.waitForFunction((arg: unknown) => {
    const [id, x, z, distance] = arg as [string, number, number, number];
    const player = (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((candidate) => candidate.id === id);
    if (!player || Math.hypot(player.x - x, player.z - z) < distance) return false;
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    return true;
  }, [idB, targetBefore.x, targetBefore.z, movedDistance]);
  await pageB.keyboard.up("w");
  await pageB.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" })));
  await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.releaseForTest());
  let previous = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players());
  let stableSamples = 0;
  await expect.poll(async () => {
    const current = await pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players());
    let movement = 0;
    for (const player of current) { const old = previous.find((candidate) => candidate.id === player.id); if (old) movement = Math.max(movement, Math.hypot(player.x - old.x, player.z - old.z)); }
    previous = current; stableSamples = movement < 0.02 ? stableSamples + 1 : 0; return stableSamples;
  }, { timeout: 10_000 }).toBeGreaterThanOrEqual(4);
  await expect.poll(async () => pageB.evaluate((arg: unknown) => {
    const [ids, distance] = arg as [[string, string], number];
    const players = (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players();
    const shooter = players.find((player) => player.id === ids[0]); const target = players.find((player) => player.id === ids[1]);
    return shooter && target ? Math.abs(Math.hypot(target.x - shooter.x, target.z - shooter.z) - distance) : Number.POSITIVE_INFINITY;
  }, [[idA, idB], initialDistance])).toBeLessThan(5);
  await pageA.bringToFront();
  await expect.poll(() => pageA.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");
  await expect.poll(() => pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.spawnProtectMsForTest()), { timeout: 8_000 }).toBe(0);
  await expect.poll(() => pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.spawnProtectMsForTest()), { timeout: 8_000 }).toBe(0);
  await pageA.locator("canvas").click();
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.aimAt(id), idB);
  await pageA.mouse.down();
  await pageA.waitForFunction(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.drawMs() >= 550);
  await pageA.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.aimAt(id), idB);
  await pageA.mouse.up();
  await pageA.evaluate(() => {
    const event = new MouseEvent("mouseup", { button: 0, bubbles: true });
    window.dispatchEvent(event);
    document.dispatchEvent(event);
  });
  await pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.releaseForTest());
  await expect.poll(() => pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.drawMs()), { timeout: 3_000 }).toBe(0);
  await expect.poll(async () => pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.killFeed()), { timeout: 8_000 }).toContain("HEADSHOT");
  await expect.poll(async () => pageB.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.killFeed()), { timeout: 8_000 }).toContain("HEADSHOT");
  await expect(pageB.locator(".bowdle-replay")).toBeVisible();
  await pageB.screenshot({ path: "test-results/qa/m6/arrow-cam.png", fullPage: true });
  await pageA.bringToFront();
  await pageA.screenshot({ path: "test-results/qa/m4b/online-combat-a.png", fullPage: true });
  await pageB.screenshot({ path: "test-results/qa/m4b/online-combat-b.png", fullPage: true });
  expect([...errorsA, ...errorsB]).toEqual([]);
  await Promise.all([contextA.close(), contextB.close()]);
});

test("a solo online player gets a full match", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=home-grove") + "&mode=expedition");
  await expect(page.getByTestId("wave")).toContainText("VILLAGE DEFENSE", { timeout: 10_000 });
  await page.keyboard.down("Tab");
  await expect(page.locator(".bowdle-scoreboard")).toContainText("EXPEDITION");
  await page.screenshot({ path: "test-results/qa/m5/full-match.png", fullPage: true });
  await page.screenshot({ path: "test-results/qa/w1/journal-online.png", fullPage: true });
  await page.keyboard.up("Tab");
  expect(errors).toEqual([]);
});

// Ink cloud is switched off for launch (src/shared/features.ts): Q must do nothing and the HUD must not offer it.
test("grapple works online and the ink cloud stays off at launch", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=lost-river"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  const peer = await page.context().newPage();
  const peerErrors = collectErrors(peer);
  await peer.goto(onlineUrl("map=lost-river"));
  await peer.waitForFunction(() => "__bowdleTest" in window);
  // Opening the second page sent this one to the background, where it samples no input.
  await page.bringToFront();
  await expect.poll(async () => page.locator(".bowdle-timer").textContent(), { timeout: 8_000 }).not.toContain("DRAW IN");
  await page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.aimAtGrapple(8));
  await page.keyboard.down("e");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.grappleActive())).toBe(true);
  await page.keyboard.up("e");
  await page.screenshot({ path: "test-results/qa/m7/grapple-rope.png", fullPage: true });
  await page.keyboard.down("q");
  await page.waitForTimeout(1_000);
  await page.keyboard.up("q");
  expect(await page.evaluate(() => (window as unknown as { __bowdleTest: AbilityTestApi }).__bowdleTest.cloudCount())).toBe(0);
  await expect(page.locator("[data-testid=ability-cooldowns]")).toContainText("GRAPPLE");
  await expect(page.locator("[data-testid=ability-cooldowns]")).not.toContainText("INK CLOUD");
  expect([...errors, ...peerErrors]).toEqual([]);
  await peer.close();
});
