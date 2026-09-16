import { expect, test } from "@playwright/test";
import type { KillMessage, MatchStatsMessage, RewardMessage } from "../../src/net/messages.ts";
import { createMatchStats } from "../../src/shared/matchStats.ts";
import { matchReward } from "../../src/shared/progression.ts";
import { collectErrors, returningPlayer, onlineUrl } from "./helpers.ts";

type Hooks = { sessionId: string; showEndScreen(): void; showMatchRewards(stats: MatchStatsMessage, reward: RewardMessage): void; showKill(message: KillMessage, atMs: number): void };

test.beforeEach(({ page }) => returningPlayer(page));

test("post-match sequence finishes, shows rewards and unlocks, and click skips", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const created = page.waitForResponse((response) => response.url().endsWith("/api/auth/guest") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const creation = await created; expect(creation.status()).toBe(201); await creation.finished();
  await expect(page.getByTestId("level")).toHaveText("Level 1");
  const token = await page.evaluate(() => localStorage.getItem("bowdle.token"));
  const seed = await page.request.post("/api/dev/grant-xp", { headers: { Authorization: `Bearer ${token}` }, data: { xp: 1500 } });
  expect(seed.status()).toBe(200);
  await page.goto(onlineUrl("map=canopy")); await page.waitForFunction(() => "__bowdleTest" in window);
  const stats = { ...createMatchStats(), kills: 3, headshots: 3, longShots: 1, longestShotM: 45, bestStreak: 3, won: true };
  const medals: MatchStatsMessage["medals"] = ["headhunter", "eagleEye"];
  const base = matchReward(stats, medals);
  const reward: RewardMessage = { ...base, xp: base.xp + 150, ink: base.ink + 30, breakdown: [...base.breakdown, { label: "Daily: Get 2 kills from 35 m or more", xp: 150, ink: 30 }], before: { level: 2, intoLevel: 900, levelSize: 1000 }, level: 3, intoLevel: 650, levelSize: 1500, levelUp: true, unlocked: ["trail.chalk"], streakDays: 2, challenges: [{ id: "d.longshots", text: "Get 2 kills from 35 m or more", before: 1, after: 2, target: 2, done: true }] };
  const inject = async () => page.evaluate(({ stats, medals, reward }) => {
    const hook = (window as unknown as { __bowdleTest: Hooks }).__bowdleTest;
    hook.showEndScreen(); hook.showMatchRewards({ stats, medals }, reward);
  }, { stats, medals, reward });
  await inject(); await expect(page.locator(".bowdle-end")).toHaveAttribute("data-sequence", "playing");
  await expect(page.locator(".bowdle-end")).toHaveAttribute("data-sequence", "complete");
  await expect(page.getByTestId("medals")).toHaveText("HeadhunterEagle Eye");
  for (const line of reward.breakdown.filter((entry) => entry.xp !== 0 || entry.ink !== 0)) await expect(page.getByTestId("rewards")).toContainText(`${line.label}: +${line.xp} XP · +${line.ink} Ink`);
  await expect(page.getByTestId("rewards")).not.toContainText("+0 XP · +0 Ink");
  const width = await page.getByTestId("postmatch-xp-fill").evaluate((element) => Number.parseFloat((element as HTMLElement).style.width));
  expect(width).toBeCloseTo(650 / 1500 * 100, 3);
  await expect(page.getByTestId("level-flash")).toHaveText("LEVEL 3");
  await expect(page.locator('[data-unlock="trail.chalk"]')).toContainText("Chalk Line");
  await expect(page.getByTestId("challenge-changes")).toContainText("Done · +30 Ink +150 XP");
  expect(await page.getByTestId("challenge-changes").locator("progress").evaluate((element) => (element as HTMLProgressElement).value)).toBe(2);
  await expect(page.getByTestId("next-expedition")).toHaveText(/^Next expedition in \d+ s$/);
  await page.screenshot({ path: "test-results/qa/r4/postmatch.png" });
  await inject(); await page.locator(".bowdle-end h2").click();
  await expect(page.locator(".bowdle-end")).toHaveAttribute("data-sequence", "complete");
  await expect(page.getByTestId("rewards")).toContainText(`+${reward.xp} XP`);
  await page.locator('[data-unlock="trail.chalk"] button').click();
  await expect(page.locator('[data-unlock="trail.chalk"] button')).toHaveText("Equipped");
  await page.screenshot({ path: "test-results/qa/r4/postmatch-skipped.png" });
  await page.getByRole("button", { name: "Play again", exact: true }).click();
  await expect(page.locator(".bowdle-end")).toBeHidden();
  expect(errors).toEqual([]);
});

test("two local kill messages one second apart show DOUBLE TAG and a bounded ticker", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=canopy")); await page.waitForFunction(() => "__bowdleTest" in window);
  await page.evaluate(() => {
    const hook = (window as unknown as { __bowdleTest: Hooks }).__bowdleTest;
    const kill: KillMessage = { killer: hook.sessionId, victim: "fixture", weapon: "arrow", headshot: true, distance: 45 };
    hook.showKill(kill, 1000); hook.showKill(kill, 2000);
  });
  await expect(page.locator(".bowdle-moment")).toHaveText("DOUBLE TAG");
  await expect(page.getByTestId("kill-streak")).toHaveText("Streak 2");
  await expect(page.getByTestId("xp-ticker").locator("div")).toHaveCount(4);
  await expect(page.getByTestId("xp-ticker")).toContainText("+25 Long shot");
  await page.screenshot({ path: "test-results/qa/r4/double-tag.png" });
  expect(errors).toEqual([]);
});

test("New match leaves the old room and opens a fresh public match", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(onlineUrl("map=canopy")); await page.waitForFunction(() => "__bowdleTest" in window);
  await page.evaluate(() => (window as unknown as { __bowdleTest: Hooks }).__bowdleTest.showEndScreen());
  await page.locator(".bowdle-end h2").click();
  await page.getByRole("button", { name: "New match", exact: true }).click();
  await expect(page).toHaveURL(/\/\?scene=online$/);
  await expect(page.locator(".bowdle-score")).toHaveText(/^\d+.*\d+$/);
  await page.screenshot({ path: "test-results/qa/r4/new-match.png" });
  expect(errors).toEqual([]);
});
