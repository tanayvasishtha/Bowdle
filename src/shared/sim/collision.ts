import { GROUND_SNAP, PLAYER_WIDTH, STEP_HEIGHT } from "../constants.ts";
import { rampHeightAt } from "../maps/ramps.ts";
import type { MapData } from "../maps/types.ts";

export type CollisionBody = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  height: number;
  grounded: boolean;
};

const EPSILON = 1e-7;
const HALF_WIDTH = PLAYER_WIDTH / 2;

function overlapsRange(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMax > bMin + EPSILON && aMin < bMax - EPSILON;
}

export function canOccupy(body: Pick<CollisionBody, "height">, map: MapData, x: number, y: number, z: number): boolean {
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    if (overlapsRange(x - HALF_WIDTH, x + HALF_WIDTH, box.min[0], box.max[0])
      && overlapsRange(y, y + body.height, box.min[1], box.max[1])
      && overlapsRange(z - HALF_WIDTH, z + HALF_WIDTH, box.min[2], box.max[2])) return false;
  }
  return true;
}

function tryStep(body: CollisionBody, map: MapData, nextX: number, nextZ: number, obstacleTop: number): boolean {
  const rise = obstacleTop - body.y;
  if (rise <= EPSILON || rise > STEP_HEIGHT + EPSILON) return false;
  if (!canOccupy(body, map, nextX, obstacleTop + EPSILON, nextZ)) return false;
  body.y = obstacleTop;
  body.grounded = true;
  return true;
}

function moveX(body: CollisionBody, amount: number, map: MapData): void {
  if (amount === 0) return;
  let destination = body.x + amount;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    if (!overlapsRange(body.z - HALF_WIDTH, body.z + HALF_WIDTH, box.min[2], box.max[2])) continue;
    if (!overlapsRange(body.y, body.y + body.height, box.min[1], box.max[1])) continue;
    const boundary = amount > 0 ? box.min[0] - HALF_WIDTH : box.max[0] + HALF_WIDTH;
    const crosses = amount > 0 ? body.x <= boundary + EPSILON && destination > boundary : body.x >= boundary - EPSILON && destination < boundary;
    if (!crosses) continue;
    if (tryStep(body, map, destination, body.z, box.max[1])) continue;
    destination = amount > 0 ? Math.min(destination, boundary) : Math.max(destination, boundary);
    body.vx = 0;
  }
  body.x = destination;
}

function moveZ(body: CollisionBody, amount: number, map: MapData): void {
  if (amount === 0) return;
  let destination = body.z + amount;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    if (!overlapsRange(body.x - HALF_WIDTH, body.x + HALF_WIDTH, box.min[0], box.max[0])) continue;
    if (!overlapsRange(body.y, body.y + body.height, box.min[1], box.max[1])) continue;
    const boundary = amount > 0 ? box.min[2] - HALF_WIDTH : box.max[2] + HALF_WIDTH;
    const crosses = amount > 0 ? body.z <= boundary + EPSILON && destination > boundary : body.z >= boundary - EPSILON && destination < boundary;
    if (!crosses) continue;
    if (tryStep(body, map, body.x, destination, box.max[1])) continue;
    destination = amount > 0 ? Math.min(destination, boundary) : Math.max(destination, boundary);
    body.vz = 0;
  }
  body.z = destination;
}

function moveY(body: CollisionBody, amount: number, map: MapData): void {
  body.grounded = false;
  if (amount === 0) return;
  let destination = body.y + amount;
  for (const box of map.boxes) {
    if (!box.tags.includes("solid")) continue;
    if (!overlapsRange(body.x - HALF_WIDTH, body.x + HALF_WIDTH, box.min[0], box.max[0])
      || !overlapsRange(body.z - HALF_WIDTH, body.z + HALF_WIDTH, box.min[2], box.max[2])) continue;
    if (amount < 0) {
      const top = box.max[1];
      if (body.y >= top - EPSILON && destination <= top) {
        destination = Math.max(destination, top);
        body.vy = 0;
        body.grounded = true;
      }
    } else {
      const bottom = box.min[1] - body.height;
      if (body.y <= bottom + EPSILON && destination >= bottom) {
        destination = Math.min(destination, bottom);
        body.vy = 0;
      }
    }
  }
  body.y = destination;
}

export function movePlayer(body: CollisionBody, map: MapData, dt: number): void {
  moveX(body, body.vx * dt, map);
  moveZ(body, body.vz * dt, map);
  moveY(body, body.vy * dt, map);
  if (body.vy <= 0) for (const ramp of map.ramps) {
    const surface = rampHeightAt(ramp, body.x, body.z);
    if (surface !== null && body.y >= surface - GROUND_SNAP && body.y <= surface + GROUND_SNAP) {
      body.y = surface;
      body.vy = 0;
      body.grounded = true;
    }
  }
}
