import { EYE_STAND } from "../constants.ts";
import { rectContains, type Rect } from "./scatter.ts";
import type { Box, MapData, PropKind, SpawnPoint, Vec3Tuple } from "./types.ts";

/** Props tall enough to look like cover. Props never collide, so each of these needs a collider under it
 *  or must stand outside the play area; otherwise arrows fly straight through something that looks solid.
 *  planeWreck is left out: it is hollow and its walls are authored as separate boxes. */
export const TALL_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([
  "giantTree", "palm", "pillar", "brokenPillar", "templeBlock", "stoneHead", "tent", "brazier", "crate",
]);

const MIN_COLLIDER_HEIGHT = 1.5;
const BASE_TOLERANCE = 0.1;

function solidBoxes(map: MapData): Box[] {
  return map.boxes.filter((box) => box.tags.includes("solid") && !box.tags.includes("invisible"));
}

/** Every tall prop inside `play` that no collider backs up. */
export function unbackedTallProps(map: MapData, play: Rect): string[] {
  // Invisible colliders count here: the prop is the visible part. The collider must start at the prop base, which rules out ceilings.
  const solids = map.boxes.filter((box) => box.tags.includes("solid"));
  const issues: string[] = [];
  for (const prop of map.props) {
    if (!TALL_PROP_KINDS.has(prop.kind)) continue;
    const [x, y, z] = prop.pos;
    if (!rectContains(play, x, z)) continue;
    const backed = solids.some((box) => x >= box.min[0] && x <= box.max[0] && z >= box.min[2] && z <= box.max[2] && box.min[1] <= y + BASE_TOLERANCE && box.max[1] >= y + MIN_COLLIDER_HEIGHT);
    if (!backed) issues.push(`${prop.kind} at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }
  return issues;
}

function segmentHitsBox(from: Vec3Tuple, to: Vec3Tuple, box: Box): boolean {
  let near = 0;
  let far = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const start = from[axis]!;
    const delta = to[axis]! - start;
    const min = box.min[axis]!;
    const max = box.max[axis]!;
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    let t0 = (min - start) / delta;
    let t1 = (max - start) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return false;
  }
  return true;
}

export function canSeePoint(map: MapData, from: Vec3Tuple, to: Vec3Tuple): boolean {
  return !solidBoxes(map).some((box) => segmentHitsBox(from, to, box));
}

/** How many spawns of a team can see the map's landmark from standing eye height. */
export function spawnsSeeingLandmark(map: MapData, spawns: readonly SpawnPoint[]): number {
  const landmark = map.landmark;
  if (!landmark) return 0;
  return spawns.filter((spawn) => canSeePoint(map, [spawn.pos[0], spawn.pos[1] + EYE_STAND, spawn.pos[2]], landmark)).length;
}
