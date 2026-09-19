import { canopyMap } from "./canopy.ts";
import { campMap } from "./camp.ts";
import { homeGroveMap } from "./homeGrove.ts";
import { lostRiverMap } from "./lostRiver.ts";
import { skyBridgesMap } from "./skyBridges.ts";
import { sunTempleMap } from "./sunTemple.ts";
import { sunkenRuinsMap } from "./sunkenRuins.ts";
import { wildCrossingMap } from "./wildCrossing.ts";
import type { MapData } from "./types.ts";

/** Pre-launch arenas kept for tests, debug deep-links, and mapById. */
export const legacyMatchMaps: readonly MapData[] = [sunTempleMap, canopyMap, lostRiverMap, skyBridgesMap, sunkenRuinsMap];

/** Launch rotation: Lobby Wild Crossing + Play Home Grove. */
export const matchMaps: readonly MapData[] = [wildCrossingMap, homeGroveMap];
export const defaultMatchMap = wildCrossingMap;

export function mapById(id: string): MapData | undefined {
  if (id === campMap.id) return campMap;
  for (const map of matchMaps) if (map.id === id) return map;
  for (const map of legacyMatchMaps) if (map.id === id) return map;
  return undefined;
}

export function nextMatchMap(id: string): MapData {
  const index = matchMaps.findIndex((map) => map.id === id);
  return matchMaps[(index + 1 + matchMaps.length) % matchMaps.length]!;
}
