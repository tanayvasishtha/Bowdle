/** Season-end and Expedition cosmetic reward ids (N2). */
import type { TierId } from "./rating.ts";
import { TIERS } from "./rating.ts";

export const SEASON_TIER_REWARDS: Record<TierId, `effect.tier.${TierId}`> = {
  scribble: "effect.tier.scribble",
  sketch: "effect.tier.sketch",
  ink: "effect.tier.ink",
  etching: "effect.tier.etching",
  illumination: "effect.tier.illumination",
  masterwork: "effect.tier.masterwork",
};

export const EXPEDITION_REWARDS = {
  wave10: "trail.expedition.wave10",
  wave20: "trail.expedition.wave20",
  colossus: "effect.expedition.colossus",
} as const;

export function seasonRewardForTier(tier: TierId): string {
  return SEASON_TIER_REWARDS[tier];
}

export function expeditionRewardIds(reachedWave: number, bosses: number): string[] {
  const ids: string[] = [];
  if (reachedWave >= 10) ids.push(EXPEDITION_REWARDS.wave10);
  if (reachedWave >= 20) ids.push(EXPEDITION_REWARDS.wave20);
  if (bosses >= 1) ids.push(EXPEDITION_REWARDS.colossus);
  return ids;
}

export const ALL_TIER_IDS: readonly TierId[] = TIERS.map((entry) => entry.id);
