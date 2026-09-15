import { BOULDER_PERIOD_MS, BOULDER_SPEED, BOULDER_TELEGRAPH_MS, LEVER_COOLDOWN_MS } from "../constants.ts";
import type { Boulder } from "../maps/types.ts";

export type BoulderPhase = "idle" | "telegraph" | "roll" | "despawn";
export type BoulderHazardSim = { phase: BoulderPhase; direction: number; t: number; phaseEndsAtMs: number; nextAtMs: number; leverReadyAtMs: number; puller: string; x: number; y: number; z: number };
export type BoulderPoint = { x: number; y: number; z: number };

export function segmentHitsBoulder(ax: number, ay: number, az: number, bx: number, by: number, bz: number, boulder: BoulderPoint, radius: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, lengthSquared = dx * dx + dy * dy + dz * dz;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((boulder.x - ax) * dx + (boulder.y - ay) * dy + (boulder.z - az) * dz) / lengthSquared)) : 0;
  return Math.hypot(boulder.x - ax - dx * t, boulder.y - ay - dy * t, boulder.z - az - dz * t) <= radius;
}

export function resetBoulderHazard(state: BoulderHazardSim, nowMs: number): void {
  state.phase = "idle"; state.direction = 1; state.t = 0; state.phaseEndsAtMs = 0; state.nextAtMs = nowMs + BOULDER_PERIOD_MS; state.leverReadyAtMs = 0; state.puller = "";
}

export function triggerBoulder(state: BoulderHazardSim, puller: string, nowMs: number): boolean {
  if (state.phase !== "idle" || nowMs < state.leverReadyAtMs) return false;
  state.phase = "telegraph"; state.phaseEndsAtMs = nowMs + BOULDER_TELEGRAPH_MS; state.puller = puller;
  if (puller) state.leverReadyAtMs = nowMs + LEVER_COOLDOWN_MS;
  return true;
}

function pathLength(boulder: Boulder): number {
  let length = 0;
  for (let index = 1; index < boulder.path.length; index += 1) {
    const from = boulder.path[index - 1]!, to = boulder.path[index]!;
    length += Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  }
  return length;
}

export function boulderPosition(boulder: Boulder, progress: number, direction: number, out: BoulderPoint): void {
  const total = pathLength(boulder); let remaining = (direction > 0 ? progress : 1 - progress) * total;
  for (let index = 1; index < boulder.path.length; index += 1) {
    const from = boulder.path[index - 1]!, to = boulder.path[index]!;
    const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (remaining <= length || index === boulder.path.length - 1) {
      const alpha = length > 0 ? Math.max(0, Math.min(1, remaining / length)) : 0;
      out.x = from[0] + (to[0] - from[0]) * alpha; out.y = from[1] + (to[1] - from[1]) * alpha; out.z = from[2] + (to[2] - from[2]) * alpha; return;
    }
    remaining -= length;
  }
}

export function stepBoulderHazard(state: BoulderHazardSim, boulder: Boulder, nowMs: number, dt: number): void {
  if (state.phase === "idle" && nowMs >= state.nextAtMs) triggerBoulder(state, "", nowMs);
  if (state.phase === "telegraph" && nowMs >= state.phaseEndsAtMs) { state.phase = "roll"; state.t = 0; }
  if (state.phase === "roll") {
    const length = pathLength(boulder);
    state.t = Math.min(1, state.t + (length > 0 ? BOULDER_SPEED * dt / length : 1));
    boulderPosition(boulder, state.t, state.direction, state);
    if (state.t >= 1) state.phase = "despawn";
  } else if (state.phase === "despawn") {
    state.phase = "idle"; state.direction *= -1; state.t = 0; state.puller = ""; state.nextAtMs = nowMs + BOULDER_PERIOD_MS;
  }
}
