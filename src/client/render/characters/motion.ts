import { MELEE_COOLDOWN_MS } from "../../../shared/constants.ts";
import { drawFraction } from "../../../shared/sim/bow.ts";
import type { PlayerSim } from "../../../shared/sim/movement.ts";
import { CHARACTER_LOOK } from "../look.ts";
import type { CharacterMotion } from "./pose.ts";

type MotionSource = Pick<PlayerSim, "vx" | "vy" | "vz" | "grounded" | "crouched" | "sliding" | "drawMs" | "meleeCooldownMs" | "grappleActive" | "zipId" | "alive" | "pitch">;

/** Progress of the dagger animation, read from the melee cooldown that the stab starts. */
export function stabProgress(meleeCooldownMs: number): number {
  const elapsed = MELEE_COOLDOWN_MS - meleeCooldownMs;
  if (meleeCooldownMs <= 0 || elapsed < 0 || elapsed >= CHARACTER_LOOK.stabAnimMs) return 0;
  return Math.max(0.001, elapsed / CHARACTER_LOOK.stabAnimMs);
}

export function motionFromSim(out: CharacterMotion, source: MotionSource, wading: boolean): CharacterMotion {
  out.speed = Math.hypot(source.vx, source.vz);
  out.verticalSpeed = source.vy;
  out.grounded = source.grounded;
  out.crouched = source.crouched;
  out.sliding = source.sliding;
  out.drawing = source.drawMs > 0;
  out.drawFraction = drawFraction(source.drawMs);
  out.stabT = stabProgress(source.meleeCooldownMs);
  out.grappling = source.grappleActive;
  out.zipping = source.zipId !== "";
  out.wading = wading;
  out.alive = source.alive;
  out.pitch = source.pitch;
  return out;
}
