import { ARROW_GRAVITY, BOT_LEAD_ITERATIONS } from "../constants.ts";
import type { Vec3 } from "../math/vec3.ts";

export type MovingTarget = Vec3 & { vx: number; vy: number; vz: number };
export type AimSolution = { yaw: number; pitch: number; time: number };

export function solveProjectileLead(origin: Readonly<Vec3>, target: Readonly<MovingTarget>, speed: number, out: AimSolution = { yaw: 0, pitch: 0, time: 0 }, iterations = BOT_LEAD_ITERATIONS): AimSolution {
  let time = Math.hypot(target.x - origin.x, target.y - origin.y, target.z - origin.z) / speed;
  let dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    dx = target.x + target.vx * time - origin.x; dy = target.y + target.vy * time - origin.y + ARROW_GRAVITY * time * time / 2; dz = target.z + target.vz * time - origin.z;
    time = Math.hypot(dx, dy, dz) / speed;
  }
  out.yaw = Math.atan2(-dx, -dz); out.pitch = Math.atan2(dy, Math.hypot(dx, dz)); out.time = time; return out;
}
