import { describe, expect, it } from "vitest";
import { DAILY_POOL, WEEKLY_POOL, dailyChallenges, weeklyChallenges, periodKeys, resetTimes, progressFrom } from "./challenges.ts";
import { createMatchStats } from "./matchStats.ts";

describe("challenge schedule", () => {
  it("selects three distinct, reproducible challenges for each period", () => {
    const day = new Date("2026-09-16T23:59:59Z");
    expect(dailyChallenges(day)).toEqual(dailyChallenges(new Date("2026-09-16T00:00:00Z")));
    expect(dailyChallenges(day)).not.toEqual(dailyChallenges(new Date("2026-09-17")));
    expect(weeklyChallenges(day)).toEqual(weeklyChallenges(new Date("2026-09-14")));
    for (const list of [dailyChallenges(day), weeklyChallenges(day)]) expect(new Set(list.map((entry) => entry.id)).size).toBe(3);
  });
  it("uses ISO week years at the year boundary and Monday UTC resets", () => {
    expect(periodKeys(new Date("2021-01-01"))).toEqual({ daily: "d:2021-01-01", weekly: "w:2020-W53" });
    expect(periodKeys(new Date("2021-01-04"))).toEqual({ daily: "d:2021-01-04", weekly: "w:2021-W01" });
    expect(resetTimes(new Date("2026-09-16T23:59:59Z"))).toEqual({ dailyResetAt: Date.parse("2026-09-17"), weeklyResetAt: Date.parse("2026-09-21") });
  });
  it("derives matches, wins, streaks and medals without counting a draw", () => {
    const stats = { ...createMatchStats(), kills: 12, bestStreak: 3, medals: ["onARoll", "upClose"] };
    const find = (id: string) => [...DAILY_POOL, ...WEEKLY_POOL].find((entry) => entry.id === id)!;
    expect(progressFrom(stats, find("d.matches"))).toBe(1);
    expect(progressFrom(stats, find("d.wins"))).toBe(0);
    expect(progressFrom({ ...stats, won: true }, find("d.wins"))).toBe(1);
    expect(progressFrom(stats, find("d.streak"))).toBe(1);
    expect(progressFrom({ ...stats, bestStreak: 2 }, find("d.streak"))).toBe(0);
    expect(progressFrom(stats, find("w.medals"))).toBe(2);
    expect(progressFrom(stats, find("d.kills"))).toBe(12);
  });
});
