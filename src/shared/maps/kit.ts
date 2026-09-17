import type { FloodTiming, MapData, SwingAnchor, Vec3Tuple } from "./types.ts";
import { FLOOD_MS, FLOOD_PERIOD_MS, FLOOD_RISE, TIDE } from "../constants.ts";

/** Deterministic swing-anchor position from match time (shared by client and server). */
export function anchorPosAt(anchor: SwingAnchor, matchTimeMs: number): Vec3Tuple {
  const periodMs = Math.max(1, anchor.sway.periodS * 1000);
  const phase = ((matchTimeMs % periodMs) + periodMs) % periodMs;
  const offset = Math.sin((phase / periodMs) * Math.PI * 2) * anchor.sway.amplitude;
  const [x, y, z] = anchor.pos;
  if (anchor.sway.axis === "x") return [x + offset, y, z];
  if (anchor.sway.axis === "y") return [x, y + offset, z];
  return [x, y, z + offset];
}

export function floodTimingFor(map: MapData): FloodTiming {
  return map.flood ?? { periodMs: FLOOD_PERIOD_MS, activeMs: FLOOD_MS, rise: FLOOD_RISE };
}

export function tideFlood(): FloodTiming {
  return { periodMs: TIDE.periodMs, activeMs: TIDE.activeMs, rise: TIDE.rise };
}
