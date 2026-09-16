import { BACKSTAB_DAMAGE, EYE_STAND, MELEE_ARC_DEG, MELEE_COOLDOWN_MS, MELEE_DAMAGE, MELEE_RANGE, SWAT } from "../constants.ts";

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

type SwatPoint = { x: number; y: number; z: number };
/**
 * True when an arrow step passes within SWAT.rangeM of the swinger's chest and inside the swing arc in front.
 * The closest point of the step to the chest decides.
 */
export function swatHits(swinger: { x: number; y: number; z: number; yaw: number }, from: SwatPoint, to: SwatPoint): boolean {
  const cx = swinger.x, cy = swinger.y + EYE_STAND * 0.75, cz = swinger.z;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((cx - from.x) * dx + (cy - from.y) * dy + (cz - from.z) * dz) / lengthSq)) : 0;
  const px = from.x + dx * t - cx, py = from.y + dy * t - cy, pz = from.z + dz * t - cz;
  if (px * px + py * py + pz * pz > SWAT.rangeM * SWAT.rangeM) return false;
  const flat = Math.hypot(px, pz);
  if (flat < 1e-6) return true;
  const facingX = -Math.sin(swinger.yaw), facingZ = -Math.cos(swinger.yaw);
  return (px * facingX + pz * facingZ) / flat >= Math.cos(SWAT.arcDeg * Math.PI / 360);
}

/** A swing swats only during its first SWAT.windowMs. */
export function inSwatWindow(meleeCooldownMs: number): boolean { return meleeCooldownMs > MELEE_COOLDOWN_MS - SWAT.windowMs; }
