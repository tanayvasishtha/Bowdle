import { BOT_LONG_LINK_M, BOT_VINE_HOP_GAP_M, BOT_VINE_HOP_REMAINING_M, BOT_SLIDE_CHANCE, BOT_WAYPOINT_REACHED_M, BOT_WAYPOINT_REACHED_Y_M, STEP_HEIGHT } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, Waypoint, WaypointLink } from "../maps/types.ts";
import { wrapAngle } from "../math/angles.ts";
import type { SeededRng } from "../math/rng.ts";
import type { PlayerSim } from "../sim/movement.ts";

export type BotMove = PlayerInputFrame;

function distance(a: Waypoint, b: Waypoint): number { return Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]); }

/** Height gained counts heavily when a bot plans from where it stands: it cannot walk straight up to a deck overhead. */
const CLIMB_COST = 4;
const CLIMB_PENALTY_M = 10;

export function nearestWaypoint(map: MapData, x: number, y: number, z: number, reachable = false): Waypoint {
  let best = map.waypoints[0]!, bestDistance = Number.POSITIVE_INFINITY;
  for (const point of map.waypoints) {
    const rise = point.pos[1] - y;
    const candidate = reachable
      ? Math.hypot(point.pos[0] - x, point.pos[2] - z) + (rise > STEP_HEIGHT ? rise * CLIMB_COST + CLIMB_PENALTY_M : Math.abs(rise))
      : Math.hypot(point.pos[0] - x, rise, point.pos[2] - z);
    if (candidate < bestDistance) { best = point; bestDistance = candidate; }
  }
  return best;
}

/** allow limits the links a path may use, for walkers that cannot zip or grapple. */
export function findPath(map: MapData, startId: string, goalId: string, allow?: (link: WaypointLink) => boolean): Waypoint[] {
  const byId = new Map(map.waypoints.map((point) => [point.id, point]));
  const start = byId.get(startId), goal = byId.get(goalId); if (!start || !goal) return [];
  const open = new Set([startId]); const came = new Map<string, string>(); const score = new Map<string, number>([[startId, 0]]); const estimate = new Map<string, number>([[startId, distance(start, goal)]]);
  while (open.size > 0) {
    let current = "", best = Number.POSITIVE_INFINITY;
    for (const id of open) { const value = estimate.get(id) ?? Number.POSITIVE_INFINITY; if (value < best) { best = value; current = id; } }
    if (current === goalId) {
      const ids = [current]; while (came.has(current)) { current = came.get(current)!; ids.push(current); } ids.reverse(); return ids.map((id) => byId.get(id)!);
    }
    open.delete(current); const point = byId.get(current)!;
    for (const link of point.links) {
      if (allow && !allow(link)) continue;
      const next = byId.get(link.to); if (!next) continue;
      const candidate = (score.get(current) ?? Number.POSITIVE_INFINITY) + distance(point, next);
      if (candidate >= (score.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      came.set(next.id, current); score.set(next.id, candidate); estimate.set(next.id, candidate + distance(next, goal)); open.add(next.id);
    }
  }
  return [];
}

export function linkTo(point: Waypoint, targetId: string): WaypointLink | undefined {
  for (const link of point.links) if (link.to === targetId) return link;
  return undefined;
}

export function followPath(player: PlayerSim, path: readonly Waypoint[], index: number, rng: SeededRng, out: BotMove): number {
  if (path.length === 0) { out.moveX = 0; out.moveZ = 0; out.buttons = 0; return index; }
  let nextIndex = Math.min(index, path.length - 1); let target = path[nextIndex]!;
  const reached = Math.hypot(target.pos[0] - player.x, target.pos[2] - player.z) < BOT_WAYPOINT_REACHED_M && Math.abs(target.pos[1] - player.y) < BOT_WAYPOINT_REACHED_Y_M;
  if (reached && nextIndex < path.length - 1) target = path[nextIndex += 1]!;
  const yaw = Math.atan2(-(target.pos[0] - player.x), -(target.pos[2] - player.z));
  const delta = wrapAngle(yaw - player.yaw); out.yaw = yaw; out.pitch = 0; out.moveZ = Math.max(0, Math.cos(delta)); out.moveX = Math.sin(delta);
  out.buttons = 0;
  const prior = path[Math.max(0, nextIndex - 1)]!; const link = linkTo(prior, target.id);
  if (link?.kind === "jump" || link?.kind === "mantle") {
    // Hold jump on the ground; in the air, release it and vine hop over a long gap once the arc starts falling.
    const gap = distance(prior, target);
    if (player.grounded) out.buttons |= BTN.JUMP;
    else if (gap > BOT_VINE_HOP_GAP_M && player.vy < 0 && player.airJumps > 0 && Math.hypot(target.pos[0] - player.x, target.pos[2] - player.z) > BOT_VINE_HOP_REMAINING_M && (player.prevButtons & BTN.JUMP) === 0) out.buttons |= BTN.JUMP;
  }
  if (link?.kind === "zip") out.buttons |= BTN.USE;
  if (link?.kind === "walk" && distance(prior, target) >= BOT_LONG_LINK_M && rng() < BOT_SLIDE_CHANCE) out.buttons |= BTN.CROUCH;
  return nextIndex;
}
