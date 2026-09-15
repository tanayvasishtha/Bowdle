import { BOT_LONG_LINK_M, BOT_SLIDE_CHANCE, BOT_WAYPOINT_REACHED_M } from "../constants.ts";
import { BTN, type PlayerInputFrame } from "../input.ts";
import type { MapData, Waypoint, WaypointLink } from "../maps/types.ts";
import { wrapAngle } from "../math/angles.ts";
import type { SeededRng } from "../math/rng.ts";
import type { PlayerSim } from "../sim/movement.ts";

export type BotMove = PlayerInputFrame;

function distance(a: Waypoint, b: Waypoint): number { return Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]); }

export function nearestWaypoint(map: MapData, x: number, y: number, z: number): Waypoint {
  let best = map.waypoints[0]!, bestDistance = Number.POSITIVE_INFINITY;
  for (const point of map.waypoints) {
    const candidate = Math.hypot(point.pos[0] - x, point.pos[1] - y, point.pos[2] - z);
    if (candidate < bestDistance) { best = point; bestDistance = candidate; }
  }
  return best;
}

export function findPath(map: MapData, startId: string, goalId: string): Waypoint[] {
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
      const next = byId.get(link.to); if (!next) continue;
      const candidate = (score.get(current) ?? Number.POSITIVE_INFINITY) + distance(point, next);
      if (candidate >= (score.get(next.id) ?? Number.POSITIVE_INFINITY)) continue;
      came.set(next.id, current); score.set(next.id, candidate); estimate.set(next.id, candidate + distance(next, goal)); open.add(next.id);
    }
  }
  return [];
}

function linkTo(point: Waypoint, targetId: string): WaypointLink | undefined { return point.links.find((link) => link.to === targetId); }

export function followPath(player: PlayerSim, path: readonly Waypoint[], index: number, rng: SeededRng, out: BotMove): number {
  if (path.length === 0) { out.moveX = 0; out.moveZ = 0; out.buttons = 0; return index; }
  let nextIndex = Math.min(index, path.length - 1); let target = path[nextIndex]!;
  if (Math.hypot(target.pos[0] - player.x, target.pos[2] - player.z) < BOT_WAYPOINT_REACHED_M && nextIndex < path.length - 1) target = path[nextIndex += 1]!;
  const yaw = Math.atan2(-(target.pos[0] - player.x), -(target.pos[2] - player.z));
  const delta = wrapAngle(yaw - player.yaw); out.yaw = yaw; out.pitch = 0; out.moveZ = Math.max(0, Math.cos(delta)); out.moveX = Math.sin(delta);
  out.buttons = 0;
  const prior = path[Math.max(0, nextIndex - 1)]!; const link = linkTo(prior, target.id);
  if (link?.kind === "jump") out.buttons |= BTN.JUMP;
  if (link?.kind === "walk" && distance(prior, target) >= BOT_LONG_LINK_M && rng() < BOT_SLIDE_CHANCE) out.buttons |= BTN.CROUCH;
  return nextIndex;
}
