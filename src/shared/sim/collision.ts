import { COLLISION_MAX_PIECES, COLLISION_MAX_STEP_M, GROUND_SNAP, MANTLE, PLAYER_WIDTH, STEP_HEIGHT } from "../constants.ts";
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

/** Solid boxes per map, filtered once; collision runs several times per player per tick. */
const solidCache = new WeakMap<MapData, readonly MapData["boxes"][number][]>();
function solidBoxes(map: MapData): readonly MapData["boxes"][number][] {
  let solids = solidCache.get(map);
  if (!solids) { solids = map.boxes.filter((box) => box.tags.includes("solid")); solidCache.set(map, solids); }
  return solids;
}
const HALF_WIDTH = PLAYER_WIDTH / 2;

function overlapsRange(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMax > bMin + EPSILON && aMin < bMax - EPSILON;
}

export function canOccupy(body: Pick<CollisionBody, "height">, map: MapData, x: number, y: number, z: number): boolean {
  for (const box of solidBoxes(map)) {
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

/**
 * Ramps are solid wedges. Returns true when a body at (x, y, z) would sit inside a ramp's wedge
 * more than a step below its surface, which is how a body walking into a ramp from the side is stopped.
 * The lowest surface point under the body decides, so entering from the low end always works.
 */
function blockedByRamp(body: CollisionBody, map: MapData, x: number, z: number): boolean {
  for (const ramp of map.ramps) {
    const minX = Math.max(x - HALF_WIDTH, ramp.min[0]), maxX = Math.min(x + HALF_WIDTH, ramp.max[0]);
    const minZ = Math.max(z - HALF_WIDTH, ramp.min[2]), maxZ = Math.min(z + HALF_WIDTH, ramp.max[2]);
    if (maxX - minX <= EPSILON || maxZ - minZ <= EPSILON) continue;
    if (body.y + body.height <= ramp.min[1] + EPSILON || body.y >= ramp.max[1] - EPSILON) continue;
    const lowX = ramp.up === "+x" ? minX : ramp.up === "-x" ? maxX : minX;
    const lowZ = ramp.up === "+z" ? minZ : ramp.up === "-z" ? maxZ : minZ;
    const lowest = rampHeightAt(ramp, lowX, lowZ);
    if (lowest !== null && body.y + STEP_HEIGHT + EPSILON < lowest) return true;
  }
  return false;
}

/** Blocks moves into a ramp wedge. A body already inside one (after landing beside it) may always move, so it can get out. */
function entersRamp(body: CollisionBody, map: MapData, x: number, z: number): boolean {
  return blockedByRamp(body, map, x, z) && !blockedByRamp(body, map, body.x, body.z);
}

function moveX(body: CollisionBody, amount: number, map: MapData): void {
  if (amount === 0) return;
  let destination = body.x + amount;
  for (const box of solidBoxes(map)) {
    if (!overlapsRange(body.z - HALF_WIDTH, body.z + HALF_WIDTH, box.min[2], box.max[2])) continue;
    if (!overlapsRange(body.y, body.y + body.height, box.min[1], box.max[1])) continue;
    const boundary = amount > 0 ? box.min[0] - HALF_WIDTH : box.max[0] + HALF_WIDTH;
    const crosses = amount > 0 ? body.x <= boundary + EPSILON && destination > boundary : body.x >= boundary - EPSILON && destination < boundary;
    if (!crosses) continue;
    if (tryStep(body, map, destination, body.z, box.max[1])) continue;
    destination = amount > 0 ? Math.min(destination, boundary) : Math.max(destination, boundary);
    body.vx = 0;
  }
  if (entersRamp(body, map, destination, body.z)) { body.vx = 0; return; }
  body.x = destination;
}

function moveZ(body: CollisionBody, amount: number, map: MapData): void {
  if (amount === 0) return;
  let destination = body.z + amount;
  for (const box of solidBoxes(map)) {
    if (!overlapsRange(body.x - HALF_WIDTH, body.x + HALF_WIDTH, box.min[0], box.max[0])) continue;
    if (!overlapsRange(body.y, body.y + body.height, box.min[1], box.max[1])) continue;
    const boundary = amount > 0 ? box.min[2] - HALF_WIDTH : box.max[2] + HALF_WIDTH;
    const crosses = amount > 0 ? body.z <= boundary + EPSILON && destination > boundary : body.z >= boundary - EPSILON && destination < boundary;
    if (!crosses) continue;
    if (tryStep(body, map, body.x, destination, box.max[1])) continue;
    destination = amount > 0 ? Math.min(destination, boundary) : Math.max(destination, boundary);
    body.vz = 0;
  }
  if (entersRamp(body, map, body.x, destination)) { body.vz = 0; return; }
  body.z = destination;
}

function moveY(body: CollisionBody, amount: number, map: MapData): void {
  body.grounded = false;
  if (amount === 0) return;
  let destination = body.y + amount;
  for (const box of solidBoxes(map)) {
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

/** What the last movePlayer call ran into. Reused to avoid allocating per substep. */
export const moveResult = { hitWall: false, wallNormalX: 0, wallNormalZ: 0 };

function noteWall(normalX: number, normalZ: number): void {
  moveResult.hitWall = true; moveResult.wallNormalX = normalX; moveResult.wallNormalZ = normalZ;
}

/** Highest solid top at most one step below the feet, under the body's footprint. */
function supportBelow(body: CollisionBody, map: MapData): number | null {
  let best: number | null = null;
  for (const box of solidBoxes(map)) {
    if (!overlapsRange(body.x - HALF_WIDTH, body.x + HALF_WIDTH, box.min[0], box.max[0])
      || !overlapsRange(body.z - HALF_WIDTH, body.z + HALF_WIDTH, box.min[2], box.max[2])) continue;
    const top = box.max[1];
    if (top <= body.y + EPSILON && top >= body.y - STEP_HEIGHT - EPSILON && (best === null || top > best)) best = top;
  }
  return best;
}

function movePiece(body: CollisionBody, map: MapData, dt: number, supported: boolean): void {
  const vx = body.vx, vz = body.vz;
  moveX(body, vx * dt, map);
  if (vx !== 0 && body.vx === 0) noteWall(vx > 0 ? -1 : 1, 0);
  moveZ(body, vz * dt, map);
  if (vz !== 0 && body.vz === 0) noteWall(0, vz > 0 ? -1 : 1);
  moveY(body, body.vy * dt, map);
  // A box that already holds the body up wins: snapping down onto a ramp here would sink the feet
  // into a deck that meets the ramp top, and the body would then fall through it.
  const standingOnBox = body.grounded;
  if (body.vy <= 0) for (const ramp of map.ramps) {
    const surface = rampHeightAt(ramp, body.x, body.z);
    if (standingOnBox && surface !== null && surface < body.y - EPSILON) continue;
    // Upward snaps reach a full step, matching what blockedByRamp lets a body walk into.
    // Downward snaps reach a full step only for a body that was already on the ground.
    const below = supported ? STEP_HEIGHT : GROUND_SNAP;
    if (surface !== null && body.y >= surface - Math.max(GROUND_SNAP, STEP_HEIGHT) && body.y <= surface + below) {
      body.y = surface;
      body.vy = 0;
      body.grounded = true;
    }
  }
  // Walking down stairs keeps the feet on each step instead of hopping off it.
  if (supported && !body.grounded && body.vy <= 0) {
    const top = supportBelow(body, map);
    if (top !== null && canOccupy(body, map, body.x, top + EPSILON, body.z)) {
      body.y = top;
      body.vy = 0;
      body.grounded = true;
    }
  }
}

/**
 * Moves a body by its velocity for dt. Fast bodies move in several pieces, none longer than
 * COLLISION_MAX_STEP_M, so they cannot pass through thin walls.
 */
export function movePlayer(body: CollisionBody, map: MapData, dt: number): void {
  moveResult.hitWall = false;
  const speed = Math.hypot(body.vx, body.vy, body.vz);
  const pieces = Math.min(COLLISION_MAX_PIECES, Math.max(1, Math.ceil((speed * dt) / COLLISION_MAX_STEP_M)));
  const pieceDt = dt / pieces;
  for (let piece = 0; piece < pieces; piece += 1) movePiece(body, map, pieceDt, body.grounded);
}

/**
 * The top of a ledge the body can climb onto: a solid box `reach` ahead whose top is between
 * MANTLE.minRise and MANTLE.maxRise above the feet, with room to stand on it.
 */
export function findMantleLedge(body: CollisionBody, map: MapData, directionX: number, directionZ: number): { x: number; z: number; top: number } | null {
  const probeX = body.x + directionX * MANTLE.reach, probeZ = body.z + directionZ * MANTLE.reach;
  let best: number | null = null;
  for (const box of solidBoxes(map)) {
    if (probeX < box.min[0] || probeX > box.max[0] || probeZ < box.min[2] || probeZ > box.max[2]) continue;
    const rise = box.max[1] - body.y;
    if (rise < MANTLE.minRise || rise > MANTLE.maxRise) continue;
    if (best === null || box.max[1] < best) best = box.max[1];
  }
  if (best === null || !canOccupy(body, map, probeX, best + EPSILON, probeZ)) return null;
  return { x: probeX, z: probeZ, top: best };
}
