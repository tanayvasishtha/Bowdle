import { RELIC } from "../constants.ts";
import type { MapData, Vec3Tuple } from "../maps/types.ts";

/** The Relic Run objective. carrier is a player id, or empty while the relic sits at home or on the ground. */
export type RelicSim = { x: number; y: number; z: number; carrier: string; home: boolean; droppedAtMs: number; droppedByTeam: number };

const FALLBACK_HOME: Vec3Tuple = [0, 0, 0];

export function relicHome(map: MapData): Vec3Tuple { return map.relic ?? FALLBACK_HOME; }

export function resetRelic(relic: RelicSim, map: MapData): void {
  const [x, y, z] = relicHome(map);
  relic.x = x; relic.y = y; relic.z = z; relic.carrier = ""; relic.home = true; relic.droppedAtMs = 0; relic.droppedByTeam = -1;
}

/** Each team's half of the map: Sun holds negative x, Moon positive x. */
export function inOwnHalf(team: number, x: number): boolean { return team === 0 ? x < 0 : x > 0; }

export function touchesRelic(relic: RelicSim, x: number, y: number, z: number): boolean {
  return Math.hypot(relic.x - x, relic.z - z) <= RELIC.touchM && y > relic.y - RELIC.touchHeightM && y < relic.y + RELIC.touchHeightM;
}

/**
 * What a touch does. Anyone picks up the relic at home. On the ground, a player of the other team than the one
 * that dropped it sends it home while standing in their own half; anyone else picks it up.
 */
export function relicTouch(relic: RelicSim, team: number, x: number): "pickup" | "return" | null {
  if (relic.carrier) return null;
  if (relic.home) return "pickup";
  return team !== relic.droppedByTeam && inOwnHalf(team, x) ? "return" : "pickup";
}

export function dropRelic(relic: RelicSim, x: number, y: number, z: number, team: number, nowMs: number): void {
  relic.x = x; relic.y = y; relic.z = z; relic.carrier = ""; relic.home = false; relic.droppedAtMs = nowMs; relic.droppedByTeam = team;
}

export function relicExpired(relic: RelicSim, nowMs: number): boolean {
  return !relic.carrier && !relic.home && nowMs - relic.droppedAtMs >= RELIC.returnMs;
}

export function inCamp(map: MapData, team: number, x: number, y: number, z: number): boolean {
  const camp = team === 0 ? map.camps?.sun : map.camps?.moon;
  if (!camp) return false;
  return x >= camp.min[0] && x <= camp.max[0] && y >= camp.min[1] && y <= camp.max[1] && z >= camp.min[2] && z <= camp.max[2];
}
