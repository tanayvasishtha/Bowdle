import type { MapData } from "../maps/types.ts";

/** Solid box bounds per map as a flat [minX, minY, minZ, maxX, maxY, maxZ, ...] array, built once. */
const solidBounds = new WeakMap<MapData, Float64Array>();
export function solidBoundsFor(map: MapData): Float64Array {
  let bounds = solidBounds.get(map);
  if (bounds) return bounds;
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  bounds = new Float64Array(solids.length * 6);
  solids.forEach((box, index) => { bounds!.set([box.min[0], box.min[1], box.min[2], box.max[0], box.max[1], box.max[2]], index * 6); });
  solidBounds.set(map, bounds);
  return bounds;
}

/** True when any solid box blocks the segment. Boxes that miss the segment's bounding box are skipped before the slab test. */
export function sightBlocked(bounds: Float64Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const loX = Math.min(ax, bx), hiX = Math.max(ax, bx), loY = Math.min(ay, by), hiY = Math.max(ay, by), loZ = Math.min(az, bz), hiZ = Math.max(az, bz);
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (let i = 0; i < bounds.length; i += 6) {
    const minX = bounds[i]!, minY = bounds[i + 1]!, minZ = bounds[i + 2]!, maxX = bounds[i + 3]!, maxY = bounds[i + 4]!, maxZ = bounds[i + 5]!;
    if (hiX < minX || loX > maxX || hiY < minY || loY > maxY || hiZ < minZ || loZ > maxZ) continue;
    let near = 0, far = 1, hit = true;
    if (Math.abs(dx) < Number.EPSILON) { if (ax < minX || ax > maxX) hit = false; }
    else { const t0 = (minX - ax) / dx, t1 = (maxX - ax) / dx; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    if (hit) {
      if (Math.abs(dy) < Number.EPSILON) { if (ay < minY || ay > maxY) hit = false; }
      else { const t0 = (minY - ay) / dy, t1 = (maxY - ay) / dy; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    }
    if (hit) {
      if (Math.abs(dz) < Number.EPSILON) { if (az < minZ || az > maxZ) hit = false; }
      else { const t0 = (minZ - az) / dz, t1 = (maxZ - az) / dz; near = Math.max(near, Math.min(t0, t1)); far = Math.min(far, Math.max(t0, t1)); if (near > far) hit = false; }
    }
    if (hit && near > 0 && near < 1) return true;
  }
  return false;
}
