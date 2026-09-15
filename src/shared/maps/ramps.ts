import type { Ramp } from "./types.ts";

export function rampHeightAt(ramp: Ramp, x: number, z: number): number | null {
  if (x < ramp.min[0] || x > ramp.max[0] || z < ramp.min[2] || z > ramp.max[2]) return null;
  const axis = ramp.up.endsWith("x") ? 0 : 2;
  const coordinate = axis === 0 ? x : z;
  const span = ramp.max[axis] - ramp.min[axis];
  if (span <= 0) return null;
  let alpha = (coordinate - ramp.min[axis]) / span;
  if (ramp.up.startsWith("-")) alpha = 1 - alpha;
  return ramp.min[1] + (ramp.max[1] - ramp.min[1]) * alpha;
}

export function rampSlopeDegrees(ramp: Ramp): number {
  const axis = ramp.up.endsWith("x") ? 0 : 2;
  return Math.atan2(ramp.max[1] - ramp.min[1], ramp.max[axis] - ramp.min[axis]) * 180 / Math.PI;
}
