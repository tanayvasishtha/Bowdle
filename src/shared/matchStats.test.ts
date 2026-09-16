import { describe, expect, it } from "vitest";
import { createMatchStats, recordDeath, recordKill, recordRobinHood, recordRopeCut } from "./matchStats.ts";
import { MEDALS, medalsFor } from "./medals.ts";
import { matchReward } from "./progression.ts";

describe("match statistics and medals", () => {
  it("tracks weapons, arrow-only distances, zip kills, clashes, rope cuts and death streak resets", () => {
    const stats = createMatchStats();
    expect(stats).toEqual({ kills: 0, deaths: 0, assists: 0, headshots: 0, longShots: 0, longestShotM: 0, daggerKills: 0, boulderKills: 0, zipKills: 0, robinHoods: 0, ropeCuts: 0, streak: 0, bestStreak: 0, won: false });
    recordKill(stats, { weapon: "arrow", headshot: true, distance: 35, onZip: true });
    recordKill(stats, { weapon: "arrow", headshot: false, distance: 34.9, onZip: false });
    recordKill(stats, { weapon: "dagger", headshot: true, distance: 100, onZip: false });
    recordDeath(stats); recordRobinHood(stats); recordRopeCut(stats);
    recordKill(stats, { weapon: "boulder", headshot: true, distance: 200, onZip: false });
    expect(stats).toEqual({ kills: 4, deaths: 1, assists: 0, headshots: 1, longShots: 1, longestShotM: 35, daggerKills: 1, boulderKills: 1, zipKills: 1, robinHoods: 1, ropeCuts: 1, streak: 1, bestStreak: 3, won: false });
    expect(createMatchStats().kills).toBe(0);
  });
  it("awards every medal in table order and excludes On a Roll from Unstoppable", () => {
    const stats = { ...createMatchStats(), kills: 6, bestStreak: 6, headshots: 3, longestShotM: 45, robinHoods: 1, daggerKills: 1, boulderKills: 1, zipKills: 1, ropeCuts: 1, assists: 4, won: true };
    expect(medalsFor(stats, 6)).toEqual(MEDALS.filter((medal) => medal.id !== "onARoll").map((medal) => medal.id));
    expect(medalsFor({ ...stats, bestStreak: 3 }, 6)).toContain("onARoll");
    expect(medalsFor({ ...stats, bestStreak: 3 }, 6)).not.toContain("unstoppable");
    expect(medalsFor(createMatchStats(), 0)).toEqual([]);
    expect(medalsFor({ ...stats, kills: 4 }, 4)).not.toContain("mvp");
    expect(medalsFor(stats, 7)).not.toContain("mvp");
    expect(medalsFor({ ...stats, deaths: 1 }, 6)).not.toContain("untouchable");
    expect(medalsFor({ ...stats, won: false }, 6)).not.toContain("untouchable");
    expect(medalsFor({ ...stats, kills: 2 }, 6)).not.toContain("untouchable");
    expect(medalsFor({ ...createMatchStats(), bestStreak: 2, headshots: 2, longestShotM: 44.9, assists: 3 }, 0)).toEqual([]);
  });
  it("Headhunter medal counts recorded headshots", () => {
    const stats = createMatchStats();
    for (let kill = 0; kill < 3; kill += 1) recordKill(stats, { weapon: "arrow", headshot: true, distance: 0, onZip: false });
    expect(medalsFor(stats, 3)).toContain("headhunter");
  });
  it("XP breakdown includes recorded headshots, long shots and only four paid medals", () => {
    const stats = createMatchStats();
    for (let kill = 0; kill < 3; kill += 1) recordKill(stats, { weapon: "arrow", headshot: true, distance: 45, onZip: false });
    stats.won = true; stats.assists = 2;
    const reward = matchReward(stats, ["mvp", "headhunter", "eagleEye", "onARoll", "untouchable"]);
    expect(reward).toEqual({ xp: 750, ink: 23, breakdown: [
      { label: "Finish the match", xp: 100, ink: 10 }, { label: "Kills", xp: 150, ink: 3 }, { label: "Assists", xp: 50, ink: 0 },
      { label: "Headshots", xp: 75, ink: 0 }, { label: "Long shots", xp: 75, ink: 0 }, { label: "Rope cuts", xp: 0, ink: 0 }, { label: "Win", xp: 200, ink: 10 }, { label: "Medals", xp: 100, ink: 0 },
    ] });
    expect(matchReward({ ...stats, ropeCuts: 2 }).breakdown).toContainEqual({ label: "Rope cuts", xp: 50, ink: 0 });
    expect(reward.breakdown.reduce((sum, line) => sum + line.xp, 0)).toBe(reward.xp);
    expect(reward.breakdown.reduce((sum, line) => sum + line.ink, 0)).toBe(reward.ink);
  });
});
