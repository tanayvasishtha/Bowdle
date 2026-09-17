import { canopyMap } from "./canopy.ts";
import { campMap } from "./camp.ts";
import { lostRiverMap } from "./lostRiver.ts";
import { skyBridgesMap } from "./skyBridges.ts";
import { sunTempleMap } from "./sunTemple.ts";
import { sunkenRuinsMap } from "./sunkenRuins.ts";
import type { MapData } from "./types.ts";

export const matchMaps: readonly MapData[] = [sunTempleMap, canopyMap, lostRiverMap, skyBridgesMap, sunkenRuinsMap];
export const defaultMatchMap = matchMaps[0]!;

export function mapById(id: string): MapData | undefined {
  if (id === campMap.id) return campMap;
  for (const map of matchMaps) if (map.id === id) return map;
  return undefined;
}

export function nextMatchMap(id: string): MapData {
  const index = matchMaps.findIndex((map) => map.id === id);
  return matchMaps[(index + 1 + matchMaps.length) % matchMaps.length]!;
}
