import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

type PartyApi = { sessionId: string; players(): Array<{ id: string; team: number }> };

test("two friends meet in a party on the same team", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const errorsA = collectErrors(pageA);
  const errorsB = collectErrors(pageB);
  for (const [page, name] of [[pageA, "Ana"], [pageB, "Ben"]] as const) {
    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("bowdle.name", value), name);
  }

  await pageA.reload();
  await pageA.getByRole("button", { name: "Play with friends" }).click();
  const code = (await pageA.getByTestId("party-code").textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await pageA.screenshot({ path: "test-results/qa/r5/party-panel.png" });
  await pageA.getByRole("button", { name: "Start party" }).click();
  await expect(pageA).toHaveURL(new RegExp(`party=${code}`), { timeout: 20_000 });

  await pageB.reload();
  await pageB.getByRole("button", { name: "Play with friends" }).click();
  await pageB.locator("[data-field=code]").fill(`${code.slice(0, 3).toLowerCase()}-${code.slice(3)}`);
  await pageB.getByRole("button", { name: "Join party" }).click();
  await expect(pageB).toHaveURL(new RegExp(`party=${code}`), { timeout: 20_000 });

  for (const page of [pageA, pageB]) {
    await page.evaluate(() => { const url = new URL(location.href); url.searchParams.set("test", ""); history.replaceState(null, "", url); });
  }
  await Promise.all([pageA.reload(), pageB.reload()]);
  await Promise.all([pageA.waitForFunction(() => "__bowdleTest" in window), pageB.waitForFunction(() => "__bowdleTest" in window)]);
  const idA = await pageA.evaluate(() => (window as unknown as { __bowdleTest: PartyApi }).__bowdleTest.sessionId);
  const idB = await pageB.evaluate(() => (window as unknown as { __bowdleTest: PartyApi }).__bowdleTest.sessionId);
  await expect.poll(async () => pageB.evaluate(({ a, b }) => {
    const players = (window as unknown as { __bowdleTest: PartyApi }).__bowdleTest.players();
    const first = players.find((player) => player.id === a), second = players.find((player) => player.id === b);
    return first && second ? first.team === second.team : false;
  }, { a: idA, b: idB }), { timeout: 10_000 }).toBe(true);

  await pageA.keyboard.press("Escape");
  await expect(pageA.getByTestId("pause-party")).toContainText(code);
  await pageA.screenshot({ path: "test-results/qa/r5/party-pause.png" });
  expect([...errorsA, ...errorsB]).toEqual([]);
  await Promise.all([contextA.close(), contextB.close()]);
});

test("a bad code is refused in the panel", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("bowdle.name", "Cal"));
  await page.reload();
  await page.getByRole("button", { name: "Play with friends" }).click();
  await page.locator("[data-field=code]").fill("OO11");
  await page.getByRole("button", { name: "Join party" }).click();
  await expect(page.locator(".bowdle-party .bowdle-error")).toContainText("6 letters and numbers");
});
