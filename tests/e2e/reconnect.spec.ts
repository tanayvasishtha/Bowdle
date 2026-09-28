import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

/**
 * A dropped connection offers a rejoin banner; clicking it navigates to `?rejoin=1&token=...` and calls
 * OnlineSession.reconnect. Unlike a fresh join, Client.reconnect() can resolve before the room's first state patch
 * arrives, so the session must not read room.state.players before it exists.
 */
test("rejoining after a dropped connection restores a live match instead of an error screen", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=home-grove") + "&mode=ffa");
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.waitForTimeout(1500);

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.waitForTimeout(4000);
  await client.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  await expect(page.getByTestId("rejoin-banner")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("rejoin-banner").locator('button[data-action="rejoin"]').click();

  // The rejoin URL does not carry the test-hook query param, so read the HUD directly rather than __bowdleTest.
  await expect(page.locator(".bowdle-loading")).not.toContainText("trail went cold", { timeout: 30_000 });
  await expect(page.locator(".bowdle-timer")).toBeVisible({ timeout: 30_000 });
  const before = await page.locator(".bowdle-timer").textContent();
  await page.waitForTimeout(2200);
  const after = await page.locator(".bowdle-timer").textContent();
  expect(after).not.toBe(before);
  expect(errors.filter((message) => !/ERR_INTERNET_DISCONNECTED/.test(message))).toEqual([]);
});
