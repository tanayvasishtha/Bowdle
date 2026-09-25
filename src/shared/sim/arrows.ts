import { ARROW_GRAVITY, ARROW_LIFETIME_MS, ARROW_RADIUS, ARROW_SPAWN_FORWARD, EYE_CROUCH, EYE_STAND, HEAD_MULT, QUIVER } from "../constants.ts";
import type { MapData } from "../maps/types.ts";
import { rampHeightAt } from "../maps/ramps.ts";
import type { Vec3 } from "../math/vec3.ts";
import type { ArrowKind, FireEvent } from "./bow.ts";
import { sweepTargetHit, type HitboxTarget, type TargetHit } from "./hitboxes.ts";
import { volumeSurfaceY } from "./volumes.ts";

export type ArrowSim = Vec3 & { vx: number; vy: number; vz: number; damage: number; ageMs: number; stuck: boolean };
/** boxHit is true when the arrow stopped in a solid box rather than a ramp or water. */
export type ArrowStep = { worldHit: boolean; t: number; boxHit: boolean };

const from: Vec3 = { x: 0, y: 0, z: 0 };
const to: Vec3 = { x: 0, y: 0, z: 0 };

/** Every arrow one release shoots: three spread by the scatter angle for a scatter volley, otherwise one. */
export function spawnVolley(event: FireEvent, crouched = false): Array<ArrowSim & { kind: ArrowKind }> {
  if (event.kind !== "scatter") return [{ ...spawnArrow(event, crouched), kind: event.kind }];
  const base = spawnArrow(event, crouched);
  const spread = QUIVER.scatter.spreadDeg * Math.PI / 180;
  return [-spread, 0, spread].map((offset) => {
    const cos = Math.cos(offset);
    const sin = Math.sin(offset);
    const vx = base.vx * cos + base.vz * sin;
    const vz = -base.vx * sin + base.vz * cos;
    return { ...base, vx, vz, kind: "scatter" as const };
  });
}

export function headMultiplier(kind: string): number { return kind === "scatter" ? QUIVER.scatter.headMult : HEAD_MULT; }

/** Point on the look ray at range meters (crosshair convergence target). */
export function aimPointFromLook(
  x: number, y: number, z: number,
  yaw: number, pitch: number,
  crouched = false,
  range = 200,
): { x: number; y: number; z: number } {
  const eye = crouched ? EYE_CROUCH : EYE_STAND;
  const lookX = -Math.sin(yaw) * Math.cos(pitch);
  const lookY = Math.sin(pitch);
  const lookZ = -Math.cos(yaw) * Math.cos(pitch);
  return {
    x: x + lookX * range,
    y: y + eye + lookY * range,
    z: z + lookZ * range,
  };
}

const AIM_MAX_M = 200;
const AIM_MIN_M = 2;
const aimFrom: Vec3 = { x: 0, y: 0, z: 0 };
const aimTo: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * How far along the look ray the crosshair points: the first solid box, ramp surface or target, capped at 200 m.
 * The arrow is launched from the bow hand toward that point, so it lands on the crosshair. Client prediction, the
 * server and the practice camp all call this with the map they step arrows against, so they pick the same point.
 */
export function aimRangeAlongLook(
  event: Pick<FireEvent, "x" | "y" | "z" | "yaw" | "pitch">,
  crouched: boolean,
  map: MapData,
  targets: Iterable<HitboxTarget>,
): number {
  const eye = crouched ? EYE_CROUCH : EYE_STAND;
  const cosPitch = Math.cos(event.pitch);
  aimFrom.x = event.x; aimFrom.y = event.y + eye; aimFrom.z = event.z;
  aimTo.x = event.x - Math.sin(event.yaw) * cosPitch * AIM_MAX_M;
  aimTo.y = aimFrom.y + Math.sin(event.pitch) * AIM_MAX_M;
  aimTo.z = event.z - Math.cos(event.yaw) * cosPitch * AIM_MAX_M;
  let nearest = 1;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    const t = sweepExpandedBox(aimFrom, aimTo, box.min, box.max);
    if (t !== null && t < nearest) nearest = t;
  }
  for (const ramp of map.ramps) {
    const t = surfaceHit(aimFrom, aimTo, rampHeightAt(ramp, aimFrom.x, aimFrom.z), rampHeightAt(ramp, aimTo.x, aimTo.z));
    if (t !== null && t < nearest) nearest = t;
  }
  for (const target of targets) {
    const hit = sweepArrowVsTarget(aimFrom, aimTo, target, "arrow");
    if (hit && hit.t < nearest) nearest = hit.t;
  }
  return Math.max(AIM_MIN_M, nearest * AIM_MAX_M);
}

export function spawnArrow(event: Omit<FireEvent, "kind">, crouched = false): ArrowSim {
  const eye = crouched ? EYE_CROUCH : EYE_STAND;
  const handY = eye - 0.22;
  const right = 0.22;
  const forward = 0.12;
  const sinYaw = Math.sin(event.yaw);
  const cosYaw = Math.cos(event.yaw);
  const hx = event.x + cosYaw * right - sinYaw * forward;
  const hy = event.y + handY;
  const hz = event.z - sinYaw * right - cosYaw * forward;
  const range = event.aimRange ?? 200;
  const aim = aimPointFromLook(event.x, event.y, event.z, event.yaw, event.pitch, crouched, range);
  let dx = aim.x - hx;
  let dy = aim.y - hy;
  let dz = aim.z - hz;
  const horiz = Math.hypot(dx, dz) || 1;
  const flight = horiz / Math.max(1, event.speed);
  // Lift for drop only when the crosshair is on something at a known range. With nothing under the crosshair the range
  // is just the 200 m cap, and lifting for that sent close shots about 0.4 m over whatever was just past the crosshair.
  if (range < AIM_MAX_M) dy += 0.5 * ARROW_GRAVITY * flight * flight;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  return {
    x: hx + dx * ARROW_SPAWN_FORWARD,
    y: hy + dy * ARROW_SPAWN_FORWARD,
    z: hz + dz * ARROW_SPAWN_FORWARD,
    vx: dx * event.speed,
    vy: dy * event.speed,
    vz: dz * event.speed,
    damage: event.damage,
    ageMs: 0,
    stuck: false,
  };
}

/**
 * Solid box bounds per map as a flat [minX, minY, minZ, maxX, maxY, maxZ, ...] array, built once per map.
 * An arrow used to run the slab test against every box on the map, and the launch maps carry hundreds of them.
 */
const solidBoxBounds = new WeakMap<MapData, Float64Array>();
function solidBoxesFor(map: MapData): Float64Array {
  let bounds = solidBoxBounds.get(map);
  if (bounds) return bounds;
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  bounds = new Float64Array(solids.length * 6);
  solids.forEach((box, index) => { bounds!.set([box.min[0], box.min[1], box.min[2], box.max[0], box.max[1], box.max[2]], index * 6); });
  solidBoxBounds.set(map, bounds);
  return bounds;
}

const sweepMin: number[] = [0, 0, 0];
const sweepMax: number[] = [0, 0, 0];

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

function surfaceHit(start: Readonly<Vec3>, end: Readonly<Vec3>, startHeight: number | null, endHeight: number | null): number | null {
  if (startHeight === null || endHeight === null) return null;
  const startDistance = start.y - startHeight - ARROW_RADIUS;
  const endDistance = end.y - endHeight - ARROW_RADIUS;
  if (startDistance < 0 || endDistance > 0) return null;
  const denominator = startDistance - endDistance;
  return denominator <= 0 ? null : startDistance / denominator;
}

export function stepArrow(arrow: ArrowSim, map: MapData, dt: number, gravity = ARROW_GRAVITY, matchTimeMs = 0): ArrowStep {
  if (arrow.stuck) return { worldHit: true, t: 0, boxHit: false };
  from.x = arrow.x; from.y = arrow.y; from.z = arrow.z;
  to.x = arrow.x + arrow.vx * dt;
  to.y = arrow.y + arrow.vy * dt - gravity * dt * dt / 2;
  to.z = arrow.z + arrow.vz * dt;
  let earliest = 1;
  let hit = false, boxHit = false;
  const bounds = solidBoxesFor(map);
  // Reject boxes the flight segment cannot touch before running the slab test.
  const loX = Math.min(from.x, to.x) - ARROW_RADIUS, hiX = Math.max(from.x, to.x) + ARROW_RADIUS;
  const loY = Math.min(from.y, to.y) - ARROW_RADIUS, hiY = Math.max(from.y, to.y) + ARROW_RADIUS;
  const loZ = Math.min(from.z, to.z) - ARROW_RADIUS, hiZ = Math.max(from.z, to.z) + ARROW_RADIUS;
  for (let index = 0; index < bounds.length; index += 6) {
    const minX = bounds[index]!, minY = bounds[index + 1]!, minZ = bounds[index + 2]!;
    const maxX = bounds[index + 3]!, maxY = bounds[index + 4]!, maxZ = bounds[index + 5]!;
    if (hiX < minX || loX > maxX || hiY < minY || loY > maxY || hiZ < minZ || loZ > maxZ) continue;
    sweepMin[0] = minX; sweepMin[1] = minY; sweepMin[2] = minZ;
    sweepMax[0] = maxX; sweepMax[1] = maxY; sweepMax[2] = maxZ;
    const t = sweepExpandedBox(from, to, sweepMin, sweepMax);
    if (t !== null && t < earliest) { earliest = t; hit = true; boxHit = true; }
  }
  for (const ramp of map.ramps) {
    const t = surfaceHit(from, to, rampHeightAt(ramp, from.x, from.z), rampHeightAt(ramp, to.x, to.z));
    if (t !== null && t < earliest) { earliest = t; hit = true; boxHit = false; }
  }
  for (const volume of map.volumes) if (volume.kind === "water") {
    const startInside = from.x >= volume.min[0] && from.x <= volume.max[0] && from.z >= volume.min[2] && from.z <= volume.max[2];
    const endInside = to.x >= volume.min[0] && to.x <= volume.max[0] && to.z >= volume.min[2] && to.z <= volume.max[2];
    const surface = volumeSurfaceY(volume, matchTimeMs, map);
    const t = surfaceHit(from, to, startInside ? surface : null, endInside ? surface : null);
    if (t !== null && t < earliest) { earliest = t; hit = true; boxHit = false; }
  }
  arrow.x = from.x + (to.x - from.x) * earliest;
  arrow.y = from.y + (to.y - from.y) * earliest;
  arrow.z = from.z + (to.z - from.z) * earliest;
  arrow.vy -= gravity * dt * earliest;
  arrow.ageMs += dt * 1000 * earliest;
  arrow.stuck = hit;
  return { worldHit: hit, t: earliest, boxHit };
}

/** Where a landing prediction stopped: the world, a player's body or head, or nowhere before the arrow expires. */
export type Landing = Vec3 & { kind: "world" | "body" | "head" | "creature" | "none" };

const LANDING_STEP_S = 1 / 60;
const LANDING_MAX_S = 3;
const landingFrom: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Where an arrow released now would first land. It flies the same arrow the server launches (spawnArrow and stepArrow
 * against the same map), sweeping `targets` each step, and writes the point into `out`. `creatures`, when given, returns
 * how far along a stretch of flight (0 to 1) it hits a creature, or -1.
 */
export function predictLanding(event: Omit<FireEvent, "kind">, crouched: boolean, map: MapData, targets: Iterable<HitboxTarget>, out: Landing, matchTimeMs = 0, gravity = ARROW_GRAVITY, creatures?: (from: Readonly<Vec3>, to: Readonly<Vec3>) => number): Landing {
  const arrow = spawnArrow(event, crouched);
  out.kind = "none"; out.x = arrow.x; out.y = arrow.y; out.z = arrow.z;
  for (let elapsed = 0; elapsed < ARROW_LIFETIME_MS / 1000; elapsed += LANDING_STEP_S) {
    landingFrom.x = arrow.x; landingFrom.y = arrow.y; landingFrom.z = arrow.z;
    stepArrow(arrow, map, LANDING_STEP_S, gravity, matchTimeMs);
    let nearest = 2;
    for (const target of targets) {
      const hit = sweepTargetHit(landingFrom, arrow, target, ARROW_RADIUS);
      if (hit && hit.t < nearest) { nearest = hit.t; out.kind = hit.kind; }
    }
    const creature = creatures ? creatures(landingFrom, arrow) : -1;
    if (creature >= 0 && creature < nearest) { nearest = creature; out.kind = "creature"; }
    if (nearest <= 1) {
      out.x = landingFrom.x + (arrow.x - landingFrom.x) * nearest;
      out.y = landingFrom.y + (arrow.y - landingFrom.y) * nearest;
      out.z = landingFrom.z + (arrow.z - landingFrom.z) * nearest;
      return out;
    }
    out.x = arrow.x; out.y = arrow.y; out.z = arrow.z;
    if (arrow.stuck) { out.kind = "world"; return out; }
  }
  return out;
}

export function sweepArrowVsTarget(start: Readonly<Vec3>, end: Readonly<Vec3>, target: HitboxTarget, kind = "arrow"): (TargetHit & { damageMultiplier: number }) | null {
  const hit = sweepTargetHit(start, end, target, ARROW_RADIUS);
  if (!hit) return null;
  return { ...hit, damageMultiplier: hit.kind === "head" ? headMultiplier(kind) : 1 };
}
