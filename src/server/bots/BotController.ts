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
} from "../../shared/constants.ts";
import { BTN, type PlayerInputFrame } from "../../shared/input.ts";
import type { MapData, Vec3Tuple, Waypoint } from "../../shared/maps/types.ts";
import { mulberry32, type SeededRng } from "../../shared/math/rng.ts";
import { solveProjectileLead, type AimSolution, type MovingTarget } from "../../shared/bots/aim.ts";
import { findPath, followPath, nearestWaypoint } from "../../shared/bots/nav.ts";
import { headCenterY } from "../../shared/sim/hitboxes.ts";
import type { PlayerSim } from "../../shared/sim/movement.ts";
import { sphereBlocksSight, type VisionSphere } from "../../shared/sim/abilities.ts";

export type BotDifficulty = "easy" | "normal" | "hard";
export type BotMode = "roam" | "engage" | "retreat";
const noClouds: readonly VisionSphere[] = [];

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

  constructor(id: string, seed: number, difficulty: BotDifficulty = "normal") {
    this.id = id;
    this.rng = mulberry32(seed);
    const degrees = difficulty === "easy" ? BOT_AIM_ERROR_EASY_DEG : difficulty === "hard" ? BOT_AIM_ERROR_HARD_DEG : BOT_AIM_ERROR_NORMAL_DEG;
    this.errorRad = degrees * Math.PI / 180;
  }

  update(player: PlayerSim, players: Iterable<readonly [string, PlayerSim]>, map: MapData, nowMs: number, clouds: Iterable<VisionSphere> = noClouds): PlayerInputFrame {
    const target = this.closestVisibleEnemy(player, players, map, clouds);
    if (player.hp < BOT_RETREAT_HP) this.mode = "retreat";
    else if (target) this.mode = "engage";
    else this.mode = "roam";
    if (this.mode === "engage" && target) this.engage(player, target[1], target[0], nowMs);
    else this.navigate(player, target?.[1], map);
    if (this.mode === "retreat" && player.inkCooldownMs <= 0) this.input.buttons |= BTN.INK;
    return this.input;
  }

  private closestVisibleEnemy(player: PlayerSim, players: Iterable<readonly [string, PlayerSim]>, map: MapData, clouds: Iterable<VisionSphere>): readonly [string, PlayerSim] | null {
    let best: readonly [string, PlayerSim] | null = null, distance = Number.POSITIVE_INFINITY;
    this.origin.x = player.x; this.origin.y = player.y + (player.crouched ? EYE_CROUCH : EYE_STAND); this.origin.z = player.z;
    for (const entry of players) {
      const [id, candidate] = entry; if (id === this.id || !candidate.alive || candidate.team === player.team) continue;
      this.targetPose.x = candidate.x; this.targetPose.y = headCenterY(candidate) + HEAD_RADIUS; this.targetPose.z = candidate.z;
      let blocked = false; for (const box of map.boxes) if (box.tags.includes("solid") && segmentHitsBox(this.origin, this.targetPose, box.min, box.max)) { blocked = true; break; }
      if (!blocked) for (const cloud of clouds) if (sphereBlocksSight(this.origin, this.targetPose, cloud)) { blocked = true; break; }
      const candidateDistance = Math.hypot(candidate.x - player.x, candidate.z - player.z);
      if (!blocked && candidateDistance < distance) { best = entry; distance = candidateDistance; }
    }
    return best;
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
        const spawn = player.team === 0 ? map.spawns.red[0]! : map.spawns.green[0]!; goal = nearestWaypoint(map, ...spawn.pos);
      } else if (target) goal = nearestWaypoint(map, target.x, target.y, target.z);
      else {
        this.routeSerial += 1;
        if (this.routeSerial % BOT_SCENIC_ROUTE_EVERY === 0) goal = map.waypoints[Math.floor(this.rng() * map.waypoints.length)]!;
        else {
          const enemySpawns = player.team === 0 ? map.spawns.green : map.spawns.red;
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
