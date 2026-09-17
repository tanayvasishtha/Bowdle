import { MATCH_INK, MAX_LEVEL, RETENTION_XP, XP_PER_LEVEL_STEP, EXPEDITION } from "./constants.ts";
import { expeditionReward } from "./sim/waves.ts";
import type { MatchStats } from "./matchStats.ts";
export { MATCH_INK, MAX_LEVEL, XP_PER_LEVEL_STEP } from "./constants.ts";
export const MATCH_XP = RETENTION_XP;

export type LevelProgress = { level: number; intoLevel: number; levelSize: number };
export type MatchLine = { kills: number; assists: number; won: boolean };
export type RewardBreakdown = { label: string; xp: number; ink: number };
export type MatchReward = { xp: number; ink: number; breakdown: RewardBreakdown[] };

export function xpToReach(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return (XP_PER_LEVEL_STEP / 2) * clamped * (clamped - 1);
}

export function levelProgress(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpToReach(level + 1)) level += 1;
  const levelSize = level < MAX_LEVEL ? XP_PER_LEVEL_STEP * level : 0;
  return { level, intoLevel: xp - xpToReach(level), levelSize };
}

function count(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }

export function matchReward(line: MatchLine & Partial<MatchStats>, medals: readonly string[] = []): MatchReward {
  const kills = count(line.kills);
  const assists = count(line.assists);
  const breakdown: RewardBreakdown[] = [
    { label: "Finish the match", xp: MATCH_XP.finish, ink: MATCH_INK.finish },
    { label: "Kills", xp: MATCH_XP.kill * kills, ink: Math.min(MATCH_INK.maxKillInk, kills * MATCH_INK.perKill) },
    { label: "Assists", xp: MATCH_XP.assist * assists, ink: 0 },
    { label: "Headshots", xp: MATCH_XP.headshot * count(line.headshots ?? 0), ink: 0 },
    { label: "Long shots", xp: MATCH_XP.longShot * count(line.longShots ?? 0), ink: 0 },
    { label: "Rope cuts", xp: MATCH_XP.ropeCut * count(line.ropeCuts ?? 0), ink: 0 },
    { label: "Swats", xp: MATCH_XP.swat * count(line.swats ?? 0), ink: 0 },
    { label: "Win", xp: line.won ? MATCH_XP.win : 0, ink: line.won ? MATCH_INK.win : 0 },
    { label: "Medals", xp: MATCH_XP.medal * Math.min(MATCH_XP.maxMedals, medals.length), ink: 0 },
  ];
  return { xp: breakdown.reduce((sum, row) => sum + row.xp, 0), ink: breakdown.reduce((sum, row) => sum + row.ink, 0), breakdown };
}

/** An Expedition run pays for cleared waves and bosses only; Ink is capped per run. */
export function expeditionMatchReward(wavesCleared: number, bosses: number): MatchReward {
  const reward = expeditionReward(wavesCleared, bosses);
  const breakdown: RewardBreakdown[] = [
    { label: "Waves cleared", xp: reward.waves * EXPEDITION.xpPerWave, ink: reward.ink },
    { label: "Temple Colossus", xp: reward.bosses * EXPEDITION.xpPerBoss, ink: 0 },
  ];
  return { xp: reward.xp, ink: reward.ink, breakdown };
}

/** Seasons follow calendar quarters in UTC, for example "2026-S3". */
export function seasonId(date: Date): string {
  return `${date.getUTCFullYear()}-S${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
