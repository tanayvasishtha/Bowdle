/** Level n takes 500 * n XP to clear, so reaching level L costs 250 * L * (L - 1) XP in total. */
export const XP_PER_LEVEL_STEP = 500;
export const MAX_LEVEL = 100;

export const MATCH_XP = { finish: 100, kill: 50, assist: 25, win: 200 } as const;
export const MATCH_INK = { finish: 10, win: 10, perKill: 1, maxKillInk: 10 } as const;

export type LevelProgress = { level: number; intoLevel: number; levelSize: number };
export type MatchLine = { kills: number; assists: number; won: boolean };
export type MatchReward = { xp: number; ink: number };

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

export function matchReward(line: MatchLine): MatchReward {
  const kills = count(line.kills);
  const assists = count(line.assists);
  return {
    xp: MATCH_XP.finish + MATCH_XP.kill * kills + MATCH_XP.assist * assists + (line.won ? MATCH_XP.win : 0),
    ink: MATCH_INK.finish + (line.won ? MATCH_INK.win : 0) + Math.min(MATCH_INK.maxKillInk, kills * MATCH_INK.perKill),
  };
}

/** Seasons follow calendar quarters in UTC, for example "2026-S3". */
export function seasonId(date: Date): string {
  return `${date.getUTCFullYear()}-S${Math.floor(date.getUTCMonth() / 3) + 1}`;
}
