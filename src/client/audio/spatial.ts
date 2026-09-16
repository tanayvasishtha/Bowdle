import { AUDIO_MIX } from "../render/look.ts";

export type MusicScene = "menu" | "practice" | "match";

/** 0 in menus, 0.4 while exploring, 1 when an enemy is in view or the player was hit a moment ago. */
export function musicIntensity(scene: MusicScene, enemyVisible: boolean, msSinceDamage: number): number {
  if (scene === "menu") return 0;
  if (enemyVisible || msSinceDamage < AUDIO_MIX.combatAfterDamageMs) return 1;
  return AUDIO_MIX.exploreIntensity;
}

export type LayerMix = { pad: number; percussion: number; melody: number };

/** The pad plays at every intensity, percussion joins while exploring, the melody only in a fight. */
export function layerMix(intensity: number): LayerMix {
  const value = Math.max(0, Math.min(1, intensity));
  return {
    pad: AUDIO_MIX.padFloor + (1 - AUDIO_MIX.padFloor) * Math.min(1, value / AUDIO_MIX.exploreIntensity),
    percussion: Math.max(0, Math.min(1, (value - 0.3) / 0.7)),
    melody: Math.max(0, Math.min(1, (value - 0.6) / 0.4)),
  };
}

/** Footstep loudness for an enemy: silent when crouched, slow or out of range, quieter walking than running. */
export function footstepGain(distanceM: number, speed: number, crouched: boolean): number {
  if (crouched || speed < AUDIO_MIX.footstepMinSpeed || distanceM > AUDIO_MIX.footstepRangeM) return 0;
  const pace = speed >= AUDIO_MIX.footstepRunSpeed ? 1 : AUDIO_MIX.footstepWalkGain;
  return pace * (1 - distanceM / AUDIO_MIX.footstepRangeM);
}

export function strideLength(speed: number): number {
  return speed >= AUDIO_MIX.footstepRunSpeed ? AUDIO_MIX.runStrideM : AUDIO_MIX.walkStrideM;
}

/**
 * Where a sound is, seen from the listener: 0 straight ahead, positive to the right, in radians from -PI to PI.
 * Yaw follows the game convention, where yaw 0 faces -z.
 */
export function cueAngle(listenerX: number, listenerZ: number, listenerYaw: number, sourceX: number, sourceZ: number): number {
  const dx = sourceX - listenerX, dz = sourceZ - listenerZ;
  const forwardX = -Math.sin(listenerYaw), forwardZ = -Math.cos(listenerYaw);
  const rightX = -forwardZ, rightZ = forwardX;
  return Math.atan2(dx * rightX + dz * rightZ, dx * forwardX + dz * forwardZ);
}
