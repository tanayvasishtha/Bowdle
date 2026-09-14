import { ARROW_GRAVITY, ARROW_RADIUS, ARROW_SPAWN_FORWARD, EYE_CROUCH, EYE_STAND, HEAD_MULT } from "../constants.ts";
import type { MapData } from "../maps/types.ts";
import type { Vec3 } from "../math/vec3.ts";
import type { FireEvent } from "./bow.ts";
import { sweepTargetHit, type HitboxTarget, type TargetHit } from "./hitboxes.ts";

export type ArrowSim = Vec3 & { vx: number; vy: number; vz: number; damage: number; ageMs: number; stuck: boolean };
export type ArrowStep = { worldHit: boolean; t: number };

const from: Vec3 = { x: 0, y: 0, z: 0 };
const to: Vec3 = { x: 0, y: 0, z: 0 };

export function spawnArrow(event: FireEvent, crouched = false): ArrowSim {
  const cosPitch = Math.cos(event.pitch);
  const dx = -Math.sin(event.yaw) * cosPitch;
  const dy = Math.sin(event.pitch);
  const dz = -Math.cos(event.yaw) * cosPitch;
  const eye = crouched ? EYE_CROUCH : EYE_STAND;
  return {
    x: event.x + dx * ARROW_SPAWN_FORWARD,
    y: event.y + eye + dy * ARROW_SPAWN_FORWARD,
    z: event.z + dz * ARROW_SPAWN_FORWARD,
    vx: dx * event.speed,
    vy: dy * event.speed,
    vz: dz * event.speed,
    damage: event.damage,
    ageMs: 0,
    stuck: false,
  };
}

function sweepExpandedBox(start: Readonly<Vec3>, end: Readonly<Vec3>, min: readonly number[], max: readonly number[]): number | null {
  let near = 0;
  let far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    const origin = start[key];
    const delta = end[key] - origin;
    const low = min[axis]! - ARROW_RADIUS;
    const high = max[axis]! + ARROW_RADIUS;
    if (Math.abs(delta) < 1e-12) {
      if (origin < low || origin > high) return null;
      continue;
    }
    const a = (low - origin) / delta;
    const b = (high - origin) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near >= 0 && near <= 1 ? near : null;
}

export function stepArrow(arrow: ArrowSim, map: MapData, dt: number): ArrowStep {
  if (arrow.stuck) return { worldHit: true, t: 0 };
  from.x = arrow.x; from.y = arrow.y; from.z = arrow.z;
  to.x = arrow.x + arrow.vx * dt;
  to.y = arrow.y + arrow.vy * dt - ARROW_GRAVITY * dt * dt / 2;
  to.z = arrow.z + arrow.vz * dt;
  let earliest = 1;
  let hit = false;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    const t = sweepExpandedBox(from, to, box.min, box.max);
    if (t !== null && t < earliest) { earliest = t; hit = true; }
  }
  arrow.x = from.x + (to.x - from.x) * earliest;
  arrow.y = from.y + (to.y - from.y) * earliest;
  arrow.z = from.z + (to.z - from.z) * earliest;
  arrow.vy -= ARROW_GRAVITY * dt * earliest;
  arrow.ageMs += dt * 1000 * earliest;
  arrow.stuck = hit;
  return { worldHit: hit, t: earliest };
}

export function sweepArrowVsTarget(start: Readonly<Vec3>, end: Readonly<Vec3>, target: HitboxTarget): (TargetHit & { damageMultiplier: number }) | null {
  const hit = sweepTargetHit(start, end, target, ARROW_RADIUS);
  if (!hit) return null;
  return { ...hit, damageMultiplier: hit.kind === "head" ? HEAD_MULT : 1 };
}
