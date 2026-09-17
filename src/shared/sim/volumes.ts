import { FLOOD_MS, FLOOD_PERIOD_MS, FLOOD_RISE } from "../constants.ts";
import { floodTimingFor } from "../maps/kit.ts";
import type { MapData, Volume } from "../maps/types.ts";

export function volumeSurfaceY(volume: Volume, matchTimeMs: number, map?: MapData): number {
  if (!volume.flood) return volume.max[1];
  const timing = map ? floodTimingFor(map) : { periodMs: FLOOD_PERIOD_MS, activeMs: FLOOD_MS, rise: FLOOD_RISE };
  const phase = ((matchTimeMs % timing.periodMs) + timing.periodMs) % timing.periodMs;
  return volume.max[1] + (phase < timing.activeMs ? timing.rise : 0);
}

export function isInWater(map: MapData, x: number, y: number, z: number, matchTimeMs: number): boolean {
  for (const volume of map.volumes) if (volume.kind === "water"
    && x >= volume.min[0] && x <= volume.max[0] && z >= volume.min[2] && z <= volume.max[2]
    && y >= volume.min[1] && y < volumeSurfaceY(volume, matchTimeMs, map)) return true;
  return false;
}

export function isHiddenInTallGrass(map: MapData, x: number, y: number, z: number, height: number, crouched: boolean): boolean {
  if (!crouched) return false;
  for (const volume of map.volumes) if (volume.kind === "tallGrass"
    && x >= volume.min[0] && x <= volume.max[0] && z >= volume.min[2] && z <= volume.max[2]
    && y >= volume.min[1] && y + height <= volume.max[1]) return true;
  return false;
}
