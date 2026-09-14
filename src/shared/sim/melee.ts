import { BACKSTAB_DAMAGE, MELEE_ARC_DEG, MELEE_DAMAGE, MELEE_RANGE } from "../constants.ts";

export type MeleeActor = { x: number; y: number; z: number; yaw: number };
export type MeleeResult = { damage: number; backstab: boolean };

export function meleeHit(attacker: MeleeActor, target: MeleeActor): MeleeResult | null {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const distance = Math.hypot(dx, target.y - attacker.y, dz);
  if (distance > MELEE_RANGE || distance === 0) return null;
  const inv = 1 / Math.hypot(dx, dz);
  const toTargetX = dx * inv;
  const toTargetZ = dz * inv;
  const forwardX = -Math.sin(attacker.yaw);
  const forwardZ = -Math.cos(attacker.yaw);
  const arcCos = Math.cos(MELEE_ARC_DEG * Math.PI / 360);
  if (forwardX * toTargetX + forwardZ * toTargetZ < arcCos) return null;
  const targetForwardX = -Math.sin(target.yaw);
  const targetForwardZ = -Math.cos(target.yaw);
  const behindCos = Math.cos(Math.PI / 3);
  const behind = targetForwardX * toTargetX + targetForwardZ * toTargetZ >= behindCos;
  return { damage: behind ? BACKSTAB_DAMAGE : MELEE_DAMAGE, backstab: behind };
}
