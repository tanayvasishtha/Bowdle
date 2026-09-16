import { expect, test } from "@playwright/test";
import { collectErrors, returningPlayer } from "./helpers.ts";

test("menu reaches Practice Camp and shows the first field lesson", async ({ page }) => {
  await returningPlayer(page, true);
  const errors = collectErrors(page); await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Bowdle");
  await page.screenshot({ path: "test-results/qa/m8/main-menu.png", fullPage: true });
  await page.getByRole("button", { name: "Practice" }).click();
  await expect(page.locator("#game-canvas")).toHaveAttribute("data-map-id", "camp");
  await expect(page.locator(".bowdle-tutorial")).toContainText("move through camp");
  await page.screenshot({ path: "test-results/qa/m8/onboarding.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("first-time name entry reaches an online HUD and Esc menu", async ({ page }) => {
  await returningPlayer(page);
  const errors = collectErrors(page); await page.goto("/");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.locator(".bowdle-name input").fill("Trail Finch");
  await page.getByRole("button", { name: "Enter the jungle" }).click();
  await expect(page.locator(".bowdle-score")).toContainText("·", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator(".bowdle-pause")).toBeVisible();
  await page.screenshot({ path: "test-results/qa/m8/escape-menu.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("field of view persists after reload", async ({ page }) => {
  await returningPlayer(page);
  await page.goto("/"); await page.getByRole("button", { name: "Settings" }).click();
  await page.locator("[data-setting=fov]").fill("104");
  await expect(page.locator(".bowdle-settings output")).toHaveText("104");
  await page.getByRole("button", { name: "Done" }).click(); await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("[data-setting=fov]")).toHaveValue("104");
  await page.screenshot({ path: "test-results/qa/m8/settings.png", fullPage: true });
});
