import { QUIVER } from "../constants.ts";
import type { Vec3Tuple, ZipLine } from "../maps/types.ts";

/**
 * The zip line a tether arrow makes, or null when the shot does not qualify: it must stop in a solid box,
 * and the line from 1.2 m above the release point to the hit must be 6 to 35 m long and no steeper than 35 degrees.
 * The end is pulled back toward the start so a rider stops clear of the surface.
 */
export function tetherLine(id: string, release: Vec3Tuple, hit: Vec3Tuple, boxHit: boolean): ZipLine | null {
  if (!boxHit) return null;
  const from: Vec3Tuple = [release[0], release[1] + QUIVER.tether.liftM, release[2]];
  const dx = hit[0] - from[0], dy = hit[1] - from[1], dz = hit[2] - from[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < QUIVER.tether.minM || length > QUIVER.tether.maxM) return null;
  if (Math.atan2(Math.abs(dy), Math.hypot(dx, dz)) > QUIVER.tether.maxSlopeDeg * Math.PI / 180) return null;
  const back = (length - QUIVER.tether.endClearanceM) / length;
  return { id, from, to: [from[0] + dx * back, from[1] + dy * back, from[2] + dz * back] };
}

export function tetherExpired(expiresAtMs: number, nowMs: number): boolean { return nowMs >= expiresAtMs; }
