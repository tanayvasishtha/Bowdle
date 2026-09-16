import { expect, test } from "@playwright/test";
import { collectErrors, onlineUrl } from "./helpers.ts";

test("the end screen saves a clip and links a share on X", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=canopy"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as unknown as { __bowdleTest: { showEndScreen(): void } }).__bowdleTest.showEndScreen());
  const share = page.locator("[data-action=share]");
  await expect(share).toBeVisible();
  const href = new URL((await share.getAttribute("href"))!);
  expect(href.origin + href.pathname).toBe("https://x.com/intent/tweet");
  expect(href.searchParams.get("text")).toContain("Bowdle");
  const download = page.waitForEvent("download");
  await page.locator("[data-action=save-clip]").click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^bowdle-.*\.webm$/);
  const path = await file.path();
  const { statSync } = await import("node:fs");
  expect(statSync(path).size).toBeGreaterThan(1000);
  await expect(page.locator("[data-action=save-clip]")).toHaveText("Clip saved");
  await page.screenshot({ path: "test-results/qa/m12/end-screen.png" });
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.locator(".bowdle-end")).toBeHidden();
  expect(errors).toEqual([]);
});

test("privacy and terms pages are linked from the menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "privacy.html");
  const privacy = await page.request.get("/privacy.html");
  expect(privacy.ok()).toBe(true);
  expect(await privacy.text()).toContain("Delete account");
  const terms = await page.request.get("/terms.html");
  expect(terms.ok()).toBe(true);
  expect(await terms.text()).toContain("cannot be bought, sold, traded");
  await page.goto("/privacy.html");
  await page.screenshot({ path: "test-results/qa/m12/privacy.png" });
});
