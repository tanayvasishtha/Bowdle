import { LONG_SHOT_M } from "./constants.ts";

export type MatchStats = { kills: number; deaths: number; assists: number; headshots: number; longShots: number; longestShotM: number; daggerKills: number; boulderKills: number; zipKills: number; robinHoods: number; streak: number; bestStreak: number; won: boolean };
export function createMatchStats(): MatchStats { return { kills: 0, deaths: 0, assists: 0, headshots: 0, longShots: 0, longestShotM: 0, daggerKills: 0, boulderKills: 0, zipKills: 0, robinHoods: 0, streak: 0, bestStreak: 0, won: false }; }
export function recordKill(stats: MatchStats, kill: { weapon: "arrow" | "dagger" | "boulder"; headshot: boolean; distance: number; onZip: boolean }): void {
  stats.kills += 1; stats.streak += 1; stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  if (kill.weapon === "arrow") { if (kill.headshot) stats.headshots += 1; if (kill.distance >= LONG_SHOT_M) stats.longShots += 1; stats.longestShotM = Math.max(stats.longestShotM, kill.distance); }
  if (kill.weapon === "dagger") stats.daggerKills += 1;
  if (kill.weapon === "boulder") stats.boulderKills += 1;
  if (kill.onZip) stats.zipKills += 1;
}
export function recordDeath(stats: MatchStats): void { stats.deaths += 1; stats.streak = 0; }
export function recordRobinHood(stats: MatchStats): void { stats.robinHoods += 1; }
