import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type TestApi = { players(): Array<{ id: string; x: number; y: number; z: number }>; sessionId: string };

test("two online players see shared movement", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errorsA = collectErrors(pageA);
  const errorsB = collectErrors(pageB);
  await Promise.all([pageA.goto("/?scene=online&test"), pageB.goto("/?scene=online&test")]);
  await Promise.all([
    pageA.waitForFunction(() => "__bowdleTest" in window),
    pageB.waitForFunction(() => "__bowdleTest" in window),
  ]);
  const idA = await pageA.evaluate(() => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.sessionId);
  await pageB.waitForFunction((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().some((player) => player.id === id), idA);
  const before = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
  await pageA.keyboard.down("w");
  await expect.poll(async () => {
    const after = await pageB.evaluate((id) => (window as unknown as { __bowdleTest: TestApi }).__bowdleTest.players().find((player) => player.id === id)!, idA);
    return Math.hypot(after.x - before.x, after.z - before.z);
  }, { timeout: 8_000 }).toBeGreaterThan(5);
  await pageA.keyboard.up("w");
  await pageA.screenshot({ path: "test-results/qa/m4a/online-player-a.png", fullPage: true });
  await pageB.screenshot({ path: "test-results/qa/m4a/online-player-b.png", fullPage: true });
  expect([...errorsA, ...errorsB]).toEqual([]);
  await Promise.all([contextA.close(), contextB.close()]);
});
