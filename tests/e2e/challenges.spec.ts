import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers.ts";

test("Profile shows three daily and weekly challenges and one free reroll", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/"); await page.getByRole("button", { name: "Profile", exact: true }).click();
  const daily = page.getByTestId("daily-challenges").locator("li");
  await expect(daily).toHaveCount(3); await expect(page.getByTestId("weekly-challenges").locator("li")).toHaveCount(3);
  await expect(page.getByTestId("play-streak")).toContainText("Tomorrow's bonus: 5 Ink");
  await expect(page.locator("[data-reset=daily]")).toContainText("Resets in");
  const before = await daily.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-challenge")));
  await page.locator("[data-reroll]").first().click();
  await expect(page.locator("[data-reroll]:enabled")).toHaveCount(0);
  await expect.poll(async () => (await daily.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-challenge")))).filter((id) => !before.includes(id)).length).toBe(1);
  await page.screenshot({ path: "test-results/qa/r2/profile.png", fullPage: true });
  expect(errors).toEqual([]);
});
