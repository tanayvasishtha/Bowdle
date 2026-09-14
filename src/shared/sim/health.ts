import { MAX_HP, REGEN_DELAY_MS, REGEN_PER_S } from "../constants.ts";

export type HealthState = { hp: number; alive: boolean; lastDamageAtMs: number };

export function applyDamage(target: HealthState, damage: number, nowMs: number): boolean {
  if (!target.alive || damage <= 0) return false;
  target.hp = Math.max(0, target.hp - damage);
  target.lastDamageAtMs = nowMs;
  if (target.hp === 0) target.alive = false;
  return !target.alive;
}

export function stepRegen(target: HealthState, nowMs: number, dt: number): void {
  if (!target.alive || target.hp >= MAX_HP || nowMs - target.lastDamageAtMs < REGEN_DELAY_MS) return;
  target.hp = Math.min(MAX_HP, target.hp + REGEN_PER_S * dt);
}
