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
  BOT_STUCK_MS,
  BOT_STUCK_MOVE_M,
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import type { MapData, Vec3Tuple, Waypoint } from "../../shared/maps/types.ts";
import { mulberry32, type SeededRng } from "../../shared/math/rng.ts";
import { solveProjectileLead, type AimSolution, type MovingTarget } from "../../shared/bots/aim.ts";
import { findPath, followPath, nearestWaypoint } from "../../shared/bots/nav.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { sphereBlocksSight, type VisionSphere } from "../../shared/sim/abilities.ts";
import { isHiddenInTallGrass } from "../../shared/sim/volumes.ts";

export type BotDifficulty = "easy" | "normal" | "hard";
export type BotMode = "roam" | "engage" | "retreat";
const noClouds: readonly VisionSphere[] = [];
type BoulderThreat = { phase: "idle" | "telegraph" | "roll" | "despawn"; x: number; z: number };
const noHazards: readonly (readonly [string, BoulderThreat])[] = [];

function segmentHitsBox(from: Readonly<MovingTarget>, to: Readonly<MovingTarget>, min: Vec3Tuple, max: Vec3Tuple): boolean {
  let near = 0, far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
    const delta = to[key] - from[key];
    if (Math.abs(delta) < Number.EPSILON) { if (from[key] < min[axis]! || from[key] > max[axis]!) return false; continue; }
    const a = (min[axis]! - from[key]) / delta, b = (max[axis]! - from[key]) / delta;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); if (near > far) return false;
  }
  return near > 0 && near < 1;
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
  private readonly errorRad: number;
  private routeSerial = 0;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private movedAtMs = 0;

  constructor(id: string, seed: number, difficulty: BotDifficulty = "normal") {
    this.id = id;
    this.rng = mulberry32(seed);
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
    else this.navigate(player, target?.[1], map);
    if (this.mode === "retreat" && player.inkCooldownMs <= 0) this.input.buttons |= BTN.INK;
    this.guideRamp(player, map, target?.[1]);
    this.avoidBoulders(player, map, hazards);
    this.input.buttons &= ~BTN.USE;
    if (nowMs - this.movedAtMs >= BOT_STUCK_MS) { this.input.yaw = player.yaw + Math.PI / 2; this.input.pitch = 0; this.input.moveX = 0; this.input.moveZ = 1; this.input.buttons = BTN.JUMP; this.movedAtMs = nowMs; }
    return this.input;
  }

  private guideRamp(player: PlayerSim, map: MapData, target: PlayerSim | undefined): void {
    for (const ramp of map.ramps) {
      if (player.x < ramp.min[0] - PLAYER_WIDTH || player.x > ramp.max[0] + PLAYER_WIDTH || player.z < ramp.min[2] - PLAYER_WIDTH || player.z > ramp.max[2] + PLAYER_WIDTH) continue;
      const destinationX = target ? (target.x < player.x ? ramp.min[0] : ramp.max[0]) : player.team === 0 ? ramp.max[0] : ramp.min[0];
      const destinationZ = (ramp.min[2] + ramp.max[2]) / 2, dx = destinationX - player.x, dz = destinationZ - player.z;
      this.input.yaw = Math.atan2(-dx, -dz); this.input.pitch = 0; this.input.moveX = 0; this.input.moveZ = 1; return;
    }
  }

  private closestVisibleEnemy(player: PlayerSim, players: Iterable<readonly [string, PlayerSim]>, map: MapData, clouds: Iterable<VisionSphere>): readonly [string, PlayerSim] | null {
    let best: readonly [string, PlayerSim] | null = null, distance = Number.POSITIVE_INFINITY;
    this.origin.x = player.x; this.origin.y = player.y + (player.crouched ? EYE_CROUCH : EYE_STAND); this.origin.z = player.z;
    for (const entry of players) {
      const [id, candidate] = entry; if (id === this.id || !candidate.alive || candidate.team === player.team) continue;
      if (isHiddenInTallGrass(map, candidate.x, candidate.y, candidate.z, candidate.height, candidate.crouched)) continue;
      this.targetPose.x = candidate.x; this.targetPose.y = headCenterY(candidate) + HEAD_RADIUS; this.targetPose.z = candidate.z;
      let blocked = false; for (const box of map.boxes) if (box.tags.includes("solid") && segmentHitsBox(this.origin, this.targetPose, box.min, box.max)) { blocked = true; break; }
      if (!blocked) for (const cloud of clouds) if (sphereBlocksSight(this.origin, this.targetPose, cloud)) { blocked = true; break; }
      const candidateDistance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
      if (!blocked && candidateDistance < distance) { best = entry; distance = candidateDistance; }
    }
    return best;
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
    this.input.moveZ = 0; this.input.moveX = Math.floor(nowMs / BOT_STRAFE_MS) % 2 === 0 ? -1 : 1; this.input.buttons = 0;
    if (nowMs - this.sightedAtMs < BOT_REACTION_MS) return;
    if (this.releaseFrame) { this.releaseFrame = false; return; }
    if (this.releaseAtMs === 0) {
      this.releaseAtMs = nowMs + BOT_DRAW_MIN_MS + this.rng() * (BOT_DRAW_MAX_MS - BOT_DRAW_MIN_MS);
      this.aimYawError = (this.rng() * 2 - 1) * this.errorRad; this.aimPitchError = (this.rng() * 2 - 1) * this.errorRad;
    }
    if (nowMs < this.releaseAtMs) this.input.buttons |= BTN.FIRE;
    else { this.releaseAtMs = 0; this.releaseFrame = true; }
  }

  private navigate(player: PlayerSim, target: PlayerSim | undefined, map: MapData): void {
    if (this.path.length === 0 || this.pathIndex >= this.path.length - 1) {
      const start = nearestWaypoint(map, player.x, player.y, player.z);
      let goal: Waypoint;
      if (this.mode === "retreat") {
        const spawn = player.team === 0 ? map.spawns.sun[0]! : map.spawns.moon[0]!; goal = nearestWaypoint(map, ...spawn.pos);
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
