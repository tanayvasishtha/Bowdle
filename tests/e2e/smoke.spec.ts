import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("home page loads without errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page).toHaveTitle("Bowdle");
  await expect(page.locator("h1")).toHaveText("Bowdle");
  expect(errors).toEqual([]);
});
