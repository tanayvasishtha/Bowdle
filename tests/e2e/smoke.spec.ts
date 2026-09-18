import { expect, test } from "@playwright/test";
import { collectErrors, skipGraphicsBenchmark } from "./helpers.ts";

test("home page loads without errors", async ({ page }) => {
  await skipGraphicsBenchmark(page);
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page).toHaveTitle("Bowdle");
  await expect(page.locator("h1")).toHaveText("Bowdle");
  expect(errors).toEqual([]);
});
