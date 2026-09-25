import { CREATURE_TUNING, EXPEDITION } from "../constants.ts";
import type { SeededRng } from "../math/rng.ts";

export type CreatureKind = keyof typeof CREATURE_TUNING;
export type WaveModifier = "none" | "swarm" | "heavy" | "night" | "lowGravity";
export const WAVE_MODIFIERS: readonly Exclude<WaveModifier, "none">[] = ["swarm", "heavy", "night", "lowGravity"];

export function isBossWave(wave: number): boolean { return wave > 0 && wave % EXPEDITION.bossEvery === 0; }

/** Every third wave draws a modifier. */
export function modifierFor(wave: number, rng: SeededRng): WaveModifier {
  if (wave <= 0 || wave % EXPEDITION.modifierEvery !== 0) return "none";
  return WAVE_MODIFIERS[Math.floor(rng() * WAVE_MODIFIERS.length)]!;
}

/** Creatures in a wave: 6 + 2n, times 1.3 for each extra player, more in a swarm. */
export function waveCount(wave: number, players: number, modifier: WaveModifier = "none"): number {
  const extra = Math.max(0, Math.min(EXPEDITION.maxPlayers, players) - 1);
  const base = (EXPEDITION.baseCount + EXPEDITION.countPerWave * wave) * Math.pow(EXPEDITION.extraPlayerMult, extra);
  return Math.round(base * (modifier === "swarm" ? EXPEDITION.swarmCountMult : 1));
}

export function aliveCap(wave: number): number {
  const cap = Math.min(EXPEDITION.maxAlive, EXPEDITION.aliveBase + wave);
  return wave <= EXPEDITION.earlyWaves ? Math.min(EXPEDITION.earlyAliveCap, cap) : cap;
}

/** Creature hits on players are softer in the first waves. */
export function creatureDamageMult(wave: number): number { return wave <= EXPEDITION.earlyWaves ? EXPEDITION.earlyDamageMult : 1; }

export function hpMultiplier(modifier: WaveModifier): number {
  return modifier === "swarm" ? EXPEDITION.swarmHpMult : modifier === "heavy" ? EXPEDITION.heavyHpMult : 1;
}

export function gravityMultiplier(modifier: string): number { return modifier === "lowGravity" ? EXPEDITION.lowGravityMult : 1; }

export function bossHp(players: number): number {
  return CREATURE_TUNING.colossus.hp + CREATURE_TUNING.colossus.hpPerExtraPlayer * Math.max(0, players - 1);
}

/** The regular creatures a wave may use: everything unlocked by this wave except the boss. */
export function unlockedKinds(wave: number): Exclude<CreatureKind, "colossus">[] {
  return (["beetle", "spitter", "guardian", "mire", "wisp", "tender"] as const).filter((kind) => CREATURE_TUNING[kind].fromWave <= wave);
}

/** A seeded pick among the unlocked kinds; beetles are twice as common as anything else. */
export function pickKind(wave: number, rng: SeededRng): Exclude<CreatureKind, "colossus"> {
  const kinds = unlockedKinds(wave);
  const weighted = kinds.flatMap((kind) => kind === "beetle" ? [kind, kind] : [kind]);
  return weighted[Math.floor(rng() * weighted.length)]!;
}

/** The highest checkpoint a best wave has reached: 0, 5, 10 and so on. A new run starts one wave after it. */
export function checkpointFor(bestWave: number): number {
  return Math.max(0, Math.floor(bestWave / EXPEDITION.checkpointEvery) * EXPEDITION.checkpointEvery);
}

/** Solo players earn an extra life every five cleared waves. */
export function earnsSoloLife(clearedWave: number, players: number): boolean {
  return players === 1 && clearedWave > 0 && clearedWave % EXPEDITION.soloLifeEvery === 0;
}

export type ExpeditionReward = { xp: number; ink: number; waves: number; bosses: number };

/** 5 XP per cleared wave, 40 per boss, and 2 Ink per wave up to 30 for the run. */
export function expeditionReward(wavesCleared: number, bosses: number): ExpeditionReward {
  const waves = Math.max(0, Math.floor(wavesCleared)), bossCount = Math.max(0, Math.floor(bosses));
  return { waves, bosses: bossCount, xp: waves * EXPEDITION.xpPerWave + bossCount * EXPEDITION.xpPerBoss, ink: Math.min(EXPEDITION.inkCap, waves * EXPEDITION.inkPerWave) };
}
