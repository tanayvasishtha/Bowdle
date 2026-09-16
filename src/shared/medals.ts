import { MEDAL_LIMITS as L } from "./constants.ts";
import type { MatchStats } from "./matchStats.ts";

export const MEDALS = [
  { id: "mvp", name: "MVP" }, { id: "unstoppable", name: "Unstoppable" }, { id: "onARoll", name: "On a Roll" },
  { id: "headhunter", name: "Headhunter" }, { id: "eagleEye", name: "Eagle Eye" }, { id: "robinHood", name: "Robin Hood" },
  { id: "upClose", name: "Up Close" }, { id: "trapper", name: "Trapper" }, { id: "zipline", name: "Zipline Hero" },
  { id: "teamPlayer", name: "Team Player" }, { id: "untouchable", name: "Untouchable" },
] as const;
export type MedalId = typeof MEDALS[number]["id"];
export function medalsFor(stats: MatchStats, roomBestKills: number): MedalId[] {
  const earned: MedalId[] = [];
  if (stats.kills >= L.mvp && stats.kills === roomBestKills) earned.push("mvp");
  if (stats.bestStreak >= L.unstoppable) earned.push("unstoppable"); else if (stats.bestStreak >= L.onARoll) earned.push("onARoll");
  if (stats.headshots >= L.headhunter) earned.push("headhunter");
  if (stats.longestShotM >= L.eagleEye) earned.push("eagleEye");
  if (stats.robinHoods > 0) earned.push("robinHood");
  if (stats.daggerKills > 0) earned.push("upClose");
  if (stats.boulderKills > 0) earned.push("trapper");
  if (stats.zipKills > 0) earned.push("zipline");
  if (stats.assists >= L.teamPlayer) earned.push("teamPlayer");
  if (stats.won && stats.deaths === 0 && stats.kills >= L.untouchable) earned.push("untouchable");
  return earned;
}
