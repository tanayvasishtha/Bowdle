import {
  ARROW_SPEED_MAX,
  BOT_AIM_ERROR_EASY_DEG,
  BOT_AIM_ERROR_HARD_DEG,
  BOT_AIM_ERROR_NORMAL_DEG,
  BOT_DRAW_MAX_MS,
  BOT_DRAW_MIN_MS,
  BOT_REACTION_MS,
  BOT_RETREAT_HP,
  BOT_SCENIC_ROUTE_EVERY,
  BOT_STRAFE_MS,
  EYE_CROUCH,
  EYE_STAND,
  HEAD_RADIUS,
  GRAPPLE_RANGE,
  BOT_LONG_LINK_M,
  BOULDER_RADIUS,
  PLAYER_WIDTH,
  BOT_DODGE_CHANCE,
  BOT_PROGRESS_M,
  BOT_PROGRESS_MS,
  BOT_STUCK_MS,
  BOT_STUCK_MOVE_M,
  ZIP_ATTACH_DIST,
  MELEE_RANGE,
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import type { MapData, Vec3Tuple, Waypoint } from "../../shared/maps/types.ts";
import { mulberry32, type SeededRng } from "../../shared/math/rng.ts";
import { solveProjectileLead, type AimSolution, type MovingTarget } from "../../shared/bots/aim.ts";
import { findPath, followPath, nearestWaypoint } from "../../shared/bots/nav.ts";
import { rampHeightAt } from "../../shared/maps/ramps.ts";

const RAMP_GUIDE_TOLERANCE_M = 0.5;
const RAMP_GUIDE_DONE_M = 0.6;
const BOT_TARGET_SWITCH_RATIO = 1.3;
const BOT_UNSTUCK_MS = 500;
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { sphereBlocksSight, type VisionSphere } from "../../shared/sim/abilities.ts";
import { isHiddenInTallGrass } from "../../shared/sim/volumes.ts";

import type { BotDifficulty } from "../../shared/bots/difficulty.ts";

export type { BotDifficulty };
export type BotMode = "roam" | "engage" | "retreat";
const noClouds: readonly VisionSphere[] = [];
type BoulderThreat = { phase: "idle" | "telegraph" | "roll" | "despawn"; x: number; z: number };
const noHazards: readonly (readonly [string, BoulderThreat])[] = [];

/** Solid box bounds per map as a flat [minX, minY, minZ, maxX, maxY, maxZ, ...] array, built once. */
const solidBounds = new WeakMap<MapData, Float64Array>();
function solidBoundsFor(map: MapData): Float64Array {
  let bounds = solidBounds.get(map);
  if (bounds) return bounds;
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  bounds = new Float64Array(solids.length * 6);
  solids.forEach((box, index) => { bounds!.set([box.min[0], box.min[1], box.min[2], box.max[0], box.max[1], box.max[2]], index * 6); });
  solidBounds.set(map, bounds);
  return bounds;
}

/** True when any solid box blocks the segment. Boxes that miss the segment's bounding box are skipped before the slab test. */
function sightBlocked(bounds: Float64Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const loX = Math.min(ax, bx), hiX = Math.max(ax, bx), loY = Math.min(ay, by), hiY = Math.max(ay, by), loZ = Math.min(az, bz), hiZ = Math.max(az, bz);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < bounds.length; i += 6) {
    const minX = bounds[i]!, minY = bounds[i + 1]!, minZ = bounds[i + 2]!, maxX = bounds[i + 3]!, maxY = bounds[i + 4]!, maxZ = bounds[i + 5]!;
    if (hiX < minX || loX > maxX || hiY < minY || loY > maxY || hiZ < minZ || loZ > maxZ) continue;
    let near = 0, far = 1, hit = true;
    if (Math.abs(dx) < Number.EPSILON) { if (ax < minX || ax > maxX) hit = false; }
    else { const t0 = (minX - ax) / dx, t1 = (maxX - ax) / dx; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    if (hit) {
      if (Math.abs(dy) < Number.EPSILON) { if (ay < minY || ay > maxY) hit = false; }
      else { const t0 = (minY - ay) / dy, t1 = (maxY - ay) / dy; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    }
    if (hit) {
      if (Math.abs(dz) < Number.EPSILON) { if (az < minZ || az > maxZ) hit = false; }
      else { const t0 = (minZ - az) / dz, t1 = (maxZ - az) / dz; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    }
    if (hit && near > 0 && near < 1) return true;
  }
  return false;
}

export class BotController {
  readonly id: string;
  mode: BotMode = "roam";
  readonly input: PlayerInputFrame = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
  private readonly rng: SeededRng;
  private readonly aim: AimSolution = { yaw: 0, pitch: 0, time: 0 };
  private readonly origin: MovingTarget = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  private readonly targetPose: MovingTarget = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  private path: Waypoint[] = [];
  private pathIndex = 0;
  private targetId = "";
  private sightedAtMs = 0;
  private releaseAtMs = 0;
  private releaseFrame = false;
  private aimYawError = 0;
  private aimPitchError = 0;
  private errorRad = 0;
  difficulty: BotDifficulty = "normal";
  private routeSerial = 0;
  private progressIndex = -1;
  private progressBest = Number.POSITIVE_INFINITY;
  private progressAtMs = 0;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private movedAtMs = 0;
  private unstuckUntilMs = 0;
  private lastHp = Number.POSITIVE_INFINITY;
  private unstuckYaw = 0;
  private unstuckCount = 0;
  private strafeFlip = false;

  constructor(id: string, seed: number, difficulty: BotDifficulty = "normal") {
    this.id = id;
    this.rng = mulberry32(seed);
    this.setDifficulty(difficulty);
  }

  /** Only the aim error changes; bots never move faster or see through walls on higher settings. */
  setDifficulty(difficulty: BotDifficulty): void {
    this.difficulty = difficulty;
    const degrees = difficulty === "easy" ? BOT_AIM_ERROR_EASY_DEG : difficulty === "hard" ? BOT_AIM_ERROR_HARD_DEG : BOT_AIM_ERROR_NORMAL_DEG;
    this.errorRad = degrees * Math.PI / 180;
  }

  update(player: PlayerSim, players: Iterable<readonly [string, PlayerSim]>, map: MapData, nowMs: number, clouds: Iterable<VisionSphere> = noClouds, hazards: Iterable<readonly [string, BoulderThreat]> = noHazards): PlayerInputFrame {
    if (!Number.isFinite(this.lastX) || Math.hypot(player.x - this.lastX, player.z - this.lastZ) > BOT_STUCK_MOVE_M) { this.lastX = player.x; this.lastZ = player.z; this.movedAtMs = nowMs; }
    const target = this.closestVisibleEnemy(player, players, map, clouds);
    if (player.hp < BOT_RETREAT_HP) this.mode = "retreat";
    else if (target) this.mode = "engage";
    else this.mode = "roam";
    if (this.mode === "engage" && target) this.engage(player, target[1], target[0], nowMs);
    else this.navigate(player, target?.[1], map, nowMs);
    if (this.mode === "retreat" && player.inkCooldownMs <= 0) this.input.buttons |= BTN.INK;
    this.guideRamp(player, map, target?.[1]);
    this.useNearbyZip(player, map);
    this.avoidBoulders(player, map, hazards);
    if (nowMs - this.movedAtMs >= BOT_STUCK_MS) {
      // Wedged against something: turn aside and hop for a moment, and strafe the other way afterwards.
      this.unstuckUntilMs = nowMs + BOT_UNSTUCK_MS;
      // First back away from whatever is in front, then try the sides.
      this.unstuckYaw = player.yaw + (this.unstuckCount % 2 === 0 ? Math.PI : (this.rng() < 0.5 ? 1 : -1) * Math.PI / 2);
      this.unstuckCount += 1;
      this.strafeFlip = !this.strafeFlip; this.movedAtMs = nowMs;
    }
    // Taking damage sometimes triggers a sideways dodge.
    if (player.hp < this.lastHp && player.dodgeCooldownMs <= 0 && this.rng() < BOT_DODGE_CHANCE) { this.input.buttons |= BTN.DODGE; this.input.moveX = this.rng() < 0.5 ? -1 : 1; }
    this.lastHp = player.hp;
    if (nowMs < this.unstuckUntilMs) { this.input.yaw = this.unstuckYaw; this.input.pitch = 0; this.input.moveX = 0; this.input.moveZ = 1; this.input.buttons = BTN.JUMP; }
    return this.input;
  }

  private useNearbyZip(player: PlayerSim, map: MapData): void {
    if (player.zipId) return;
    for (const zip of map.zipLines) {
      if (Math.hypot(player.x - zip.from[0], player.y - zip.from[1], player.z - zip.from[2]) > ZIP_ATTACH_DIST) continue;
      this.input.buttons |= BTN.USE;
      return;
    }
  }

  private guideRamp(player: PlayerSim, map: MapData, target: PlayerSim | undefined): void {
    for (const ramp of map.ramps) {
      // Only steer bots standing on the slope itself. A bot beside it, below it, or on a deck at its top
      // (where the clamped surface height matches the deck) follows its route instead.
      const surface = rampHeightAt(ramp, player.x, player.z);
      if (surface === null || Math.abs(player.y - surface) > RAMP_GUIDE_TOLERANCE_M) continue;
      const destinationX = target ? (target.x < player.x ? ramp.min[0] : ramp.max[0]) : player.team === 0 ? ramp.max[0] : ramp.min[0];
      const destinationZ = (ramp.min[2] + ramp.max[2]) / 2, dx = destinationX - player.x, dz = destinationZ - player.z;
      if (Math.hypot(dx, dz) < RAMP_GUIDE_DONE_M) continue;
      this.input.yaw = Math.atan2(-dx, -dz); this.input.pitch = 0; this.input.moveX = 0; this.input.moveZ = 1; return;
    }
  }

  private closestVisibleEnemy(player: PlayerSim, players: Iterable<readonly [string, PlayerSim]>, map: MapData, clouds: Iterable<VisionSphere>): readonly [string, PlayerSim] | null {
    let best: readonly [string, PlayerSim] | null = null, distance = Number.POSITIVE_INFINITY;
    let current: readonly [string, PlayerSim] | null = null, currentDistance = Number.POSITIVE_INFINITY;
    this.origin.x = player.x; this.origin.y = player.y + (player.crouched ? EYE_CROUCH : EYE_STAND); this.origin.z = player.z;
    const solids = solidBoundsFor(map);
    for (const entry of players) {
      const [id, candidate] = entry; if (id === this.id || !candidate.alive || candidate.team === player.team) continue;
      if (isHiddenInTallGrass(map, candidate.x, candidate.y, candidate.z, candidate.height, candidate.crouched)) continue;
      this.targetPose.x = candidate.x; this.targetPose.y = headCenterY(candidate) + HEAD_RADIUS; this.targetPose.z = candidate.z;
      let blocked = sightBlocked(solids, this.origin.x, this.origin.y, this.origin.z, this.targetPose.x, this.targetPose.y, this.targetPose.z);
      if (!blocked) for (const cloud of clouds) if (sphereBlocksSight(this.origin, this.targetPose, cloud)) { blocked = true; break; }
      const candidateDistance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
      if (!blocked && id === this.targetId) { current = entry; currentDistance = candidateDistance; }
      if (!blocked && candidateDistance < distance) { best = entry; distance = candidateDistance; }
    }
    // Keep the current target unless another is clearly closer; swapping every tick restarts the reaction delay and the bot never shoots.
    return current && currentDistance <= distance * BOT_TARGET_SWITCH_RATIO ? current : best;
  }

  private avoidBoulders(player: PlayerSim, map: MapData, hazards: Iterable<readonly [string, BoulderThreat]>): void {
    for (const [id, hazard] of hazards) {
      if (hazard.phase !== "telegraph" && hazard.phase !== "roll") continue;
      let boulder: MapData["boulders"][number] | undefined;
      for (const candidate of map.boulders) if (candidate.id === id) { boulder = candidate; break; }
      if (!boulder) continue;
      for (let index = 1; index < boulder.path.length; index += 1) {
        const from = boulder.path[index - 1]!, to = boulder.path[index]!;
        const dx = to[0] - from[0], dz = to[2] - from[2], lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((player.x - from[0]) * dx + (player.z - from[2]) * dz) / lengthSquared)) : 0;
        const awayX = player.x - (from[0] + dx * t), awayZ = player.z - (from[2] + dz * t), distance = Math.hypot(awayX, awayZ);
        if (distance > BOULDER_RADIUS + PLAYER_WIDTH) continue;
        const safeDistance = distance > 0 ? distance : 1;
        const worldX = distance > 0 ? awayX / safeDistance : -dz / Math.max(Math.hypot(dx, dz), Number.EPSILON);
        const worldZ = distance > 0 ? awayZ / safeDistance : dx / Math.max(Math.hypot(dx, dz), Number.EPSILON);
        this.input.moveX = Math.cos(this.input.yaw) * worldX - Math.sin(this.input.yaw) * worldZ;
        this.input.moveZ = -Math.sin(this.input.yaw) * worldX - Math.cos(this.input.yaw) * worldZ;
        return;
      }
    }
  }

  private engage(player: PlayerSim, target: PlayerSim, targetId: string, nowMs: number): void {
    if (this.targetId !== targetId) { this.targetId = targetId; this.sightedAtMs = nowMs; this.releaseAtMs = 0; }
    this.origin.x = player.x; this.origin.y = player.y + (player.crouched ? EYE_CROUCH : EYE_STAND); this.origin.z = player.z;
    this.targetPose.x = target.x; this.targetPose.y = headCenterY(target) + HEAD_RADIUS; this.targetPose.z = target.z; this.targetPose.vx = target.vx; this.targetPose.vy = target.vy; this.targetPose.vz = target.vz;
    solveProjectileLead(this.origin, this.targetPose, ARROW_SPEED_MAX, this.aim);
    this.input.yaw = this.aim.yaw + this.aimYawError; this.input.pitch = this.aim.pitch + this.aimPitchError;
    this.input.moveZ = 0; this.input.moveX = (Math.floor(nowMs / BOT_STRAFE_MS) % 2 === 0) !== this.strafeFlip ? -1 : 1; this.input.buttons = 0;
    if (Math.hypot(target.x - player.x, target.z - player.z) <= MELEE_RANGE && player.meleeCooldownMs <= 0) { this.input.buttons = BTN.MELEE; return; }
    if (nowMs - this.sightedAtMs < BOT_REACTION_MS) return;
    if (this.releaseFrame) { this.releaseFrame = false; return; }
    if (this.releaseAtMs === 0) {
      this.releaseAtMs = nowMs + BOT_DRAW_MIN_MS + this.rng() * (BOT_DRAW_MAX_MS - BOT_DRAW_MIN_MS);
      this.aimYawError = (this.rng() * 2 - 1) * this.errorRad; this.aimPitchError = (this.rng() * 2 - 1) * this.errorRad;
    }
    if (nowMs < this.releaseAtMs) this.input.buttons |= BTN.FIRE;
    else { this.releaseAtMs = 0; this.releaseFrame = true; }
  }

  /** Drops a route the bot cannot follow, for example a deck it keeps walking under. */
  private watchProgress(player: PlayerSim, nowMs: number): void {
    const waypoint = this.path[this.pathIndex];
    if (!waypoint) return;
    const distance = Math.hypot(waypoint.pos[0] - player.x, waypoint.pos[1] - player.y, waypoint.pos[2] - player.z);
    if (this.pathIndex !== this.progressIndex || distance < this.progressBest - BOT_PROGRESS_M) {
      this.progressIndex = this.pathIndex; this.progressBest = distance; this.progressAtMs = nowMs;
      return;
    }
    if (nowMs - this.progressAtMs < BOT_PROGRESS_MS) return;
    this.path = []; this.pathIndex = 0; this.progressIndex = -1; this.progressBest = Number.POSITIVE_INFINITY; this.progressAtMs = nowMs;
    this.input.buttons |= BTN.JUMP;
  }

  private navigate(player: PlayerSim, target: PlayerSim | undefined, map: MapData, nowMs: number): void {
    if (this.path.length === 0 || this.pathIndex >= this.path.length - 1) {
      const start = nearestWaypoint(map, player.x, player.y, player.z, true);
      let goal: Waypoint;
      if (this.mode === "retreat") {
        let grassX = 0, grassY = 0, grassZ = 0, foundGrass = false;
        for (const volume of map.volumes) if (volume.kind === "tallGrass" && (player.team === 0 ? volume.max[0] <= 0 : volume.min[0] >= 0)) { grassX = (volume.min[0] + volume.max[0]) / 2; grassY = volume.min[1]; grassZ = (volume.min[2] + volume.max[2]) / 2; foundGrass = true; break; }
        if (foundGrass) goal = nearestWaypoint(map, grassX, grassY, grassZ);
        else { const spawn = player.team === 0 ? map.spawns.sun[0]! : map.spawns.moon[0]!; goal = nearestWaypoint(map, ...spawn.pos); }
      } else if (target) goal = nearestWaypoint(map, target.x, target.y, target.z);
      else {
        this.routeSerial += 1;
        if (this.routeSerial % BOT_SCENIC_ROUTE_EVERY === 0) goal = map.waypoints[Math.floor(this.rng() * map.waypoints.length)]!;
        else {
          const enemySpawns = player.team === 0 ? map.spawns.moon : map.spawns.sun;
          goal = nearestWaypoint(map, ...enemySpawns[Math.floor(this.rng() * enemySpawns.length)]!.pos);
        }
      }
      this.path = findPath(map, start.id, goal.id); this.pathIndex = 0;
    }
    this.pathIndex = followPath(player, this.path, this.pathIndex, this.rng, this.input);
    this.watchProgress(player, nowMs);
    if (player.grappleCooldownMs <= 0) this.useGrappleShortcut(player, map);
  }

  private useGrappleShortcut(player: PlayerSim, map: MapData): void {
    const goal = this.path[this.path.length - 1]; if (!goal) return;
    const direct = Math.hypot(goal.pos[0] - player.x, goal.pos[1] - player.y, goal.pos[2] - player.z);
    let bestX = 0, bestY = 0, bestZ = 0, bestSaving = BOT_LONG_LINK_M;
    for (const box of map.boxes) {
      if (!box.tags.includes("grapple")) continue;
      const x = (box.min[0] + box.max[0]) / 2, y = (box.min[1] + box.max[1]) / 2, z = (box.min[2] + box.max[2]) / 2;
      const hookDistance = Math.hypot(x - player.x, y - (player.y + EYE_STAND), z - player.z);
      if (hookDistance > GRAPPLE_RANGE) continue;
      const saving = direct - Math.hypot(goal.pos[0] - x, goal.pos[1] - y, goal.pos[2] - z);
      if (saving > bestSaving) { bestSaving = saving; bestX = x; bestY = y; bestZ = z; }
    }
    if (bestSaving <= BOT_LONG_LINK_M) return;
    const dx = bestX - player.x, dz = bestZ - player.z, horizontal = Math.hypot(dx, dz);
    this.input.yaw = Math.atan2(-dx, -dz); this.input.pitch = Math.atan2(bestY - (player.y + EYE_STAND), horizontal); this.input.buttons |= BTN.GRAPPLE;
  }
}
