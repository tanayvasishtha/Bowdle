import { describe, expect, it } from "vitest";
import { levelProgress, matchReward, seasonId, xpToReach } from "./progression.ts";

describe("progression", () => {
  it("level n needs 500 * n XP", () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(500);
    expect(xpToReach(3)).toBe(1500);
    expect(xpToReach(4)).toBe(3000);
    expect(levelProgress(0)).toEqual({ level: 1, intoLevel: 0, levelSize: 500 });
    expect(levelProgress(499).level).toBe(1);
    expect(levelProgress(500)).toEqual({ level: 2, intoLevel: 0, levelSize: 1000 });
    expect(levelProgress(1700)).toEqual({ level: 3, intoLevel: 200, levelSize: 1500 });
    expect(levelProgress(1e12)).toEqual({ level: 100, intoLevel: 1e12 - xpToReach(100), levelSize: 0 });
  });

  it("rewards finishing, fighting and winning", () => {
    expect(matchReward({ kills: 0, assists: 0, won: false })).toEqual({ xp: 100, ink: 10, breakdown: [
      { label: "Finish the match", xp: 100, ink: 10 }, { label: "Kills", xp: 0, ink: 0 }, { label: "Assists", xp: 0, ink: 0 },
      { label: "Headshots", xp: 0, ink: 0 }, { label: "Long shots", xp: 0, ink: 0 }, { label: "Win", xp: 0, ink: 0 }, { label: "Medals", xp: 0, ink: 0 },
    ] });
    expect(matchReward({ kills: 4, assists: 2, won: true })).toEqual({ xp: 100 + 200 + 50 + 200, ink: 24, breakdown: [
      { label: "Finish the match", xp: 100, ink: 10 }, { label: "Kills", xp: 200, ink: 4 }, { label: "Assists", xp: 50, ink: 0 },
      { label: "Headshots", xp: 0, ink: 0 }, { label: "Long shots", xp: 0, ink: 0 }, { label: "Win", xp: 200, ink: 10 }, { label: "Medals", xp: 0, ink: 0 },
    ] });
    expect(matchReward({ kills: 40, assists: 0, won: false }).ink).toBe(20);
    expect(matchReward({ kills: -3, assists: Number.NaN, won: false }).xp).toBeGreaterThanOrEqual(100);
  });

  it("names seasons by UTC quarter", () => {
    expect(seasonId(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-S1");
    expect(seasonId(new Date(Date.UTC(2026, 8, 16)))).toBe("2026-S3");
    expect(seasonId(new Date(Date.UTC(2026, 11, 31, 23)))).toBe("2026-S4");
  });
});
