import { expect, test } from "@playwright/test";
import { createMatchStats } from "../../src/shared/matchStats.ts";
import { matchReward } from "../../src/shared/progression.ts";
import type { MatchStatsMessage, RewardMessage } from "../../src/net/messages.ts";
import { collectErrors, onlineUrl } from "./helpers.ts";

test("the end screen lists medals and an exact reward breakdown", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=canopy"));
  await page.waitForFunction(() => "__bowdleTest" in window);
  const stats = { ...createMatchStats(), kills: 3, headshots: 3, longShots: 1, longestShotM: 45, won: true };
  const medals: MatchStatsMessage["medals"] = ["headhunter", "eagleEye"];
  const reward: RewardMessage = { ...matchReward(stats, medals), before: { level: 1, intoLevel: 0, levelSize: 500 }, challenges: [], unlocked: [], streakDays: 1, level: 2, intoLevel: 100, levelSize: 1000, levelUp: true };
  await page.evaluate(({ stats, medals, reward }) => {
    const hook = (window as unknown as { __bowdleTest: { showEndScreen(): void; showMatchRewards(stats: MatchStatsMessage, reward: RewardMessage): void } }).__bowdleTest;
    hook.showEndScreen(); hook.showMatchRewards({ stats, medals }, reward);
  }, { stats, medals, reward });
  await expect(page.getByTestId("medals")).toHaveText("HeadhunterEagle Eye");
  await expect(page.getByTestId("rewards")).toContainText(`+${reward.xp} XP`);
  for (const line of reward.breakdown.filter((entry) => entry.xp !== 0 || entry.ink !== 0)) await expect(page.getByTestId("rewards")).toContainText(`${line.label}: +${line.xp} XP · +${line.ink} Ink`);
  const bounds = (await page.locator(".bowdle-end").boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: "test-results/qa/r1/end-screen.png" });
  expect(errors).toEqual([]);
});
