import { FALL } from "../constants.ts";
import type { MapData } from "../maps/types.ts";

export type DamageRecordLike = { attacker: string; atMs: number };

/** Bodies this far below the map's lowest bound are gone. */
export function isOutOfWorld(map: MapData, y: number): boolean {
  return y < map.bounds.min[1] - FALL.belowBoundsM;
}

/** The enemy who damaged the faller most recently within the credit window gets the kill ("KNOCKED OFF"). */
export function fallCreditFor(records: Iterable<DamageRecordLike>, nowMs: number): string | undefined {
  let best: DamageRecordLike | undefined;
  for (const record of records) {
    if (nowMs - record.atMs > FALL.creditMs) continue;
    if (!best || record.atMs > best.atMs) best = record;
  }
  return best?.attacker;
}
