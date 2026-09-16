import { mulberry32 } from "../math/rng.ts";
import type { Boulder, Box, Prop, PropKind, Ramp, SpawnPoint, Volume, ZipLine } from "./types.ts";

export type Rect = { minX: number; minZ: number; maxX: number; maxZ: number };
export type ScatterKind = { kind: PropKind; weight: number; minScale: number; maxScale: number };

export type ScatterOptions = {
  seed: number;
  area: Rect;
  count: number;
  kinds: readonly ScatterKind[];
  blockers: readonly Rect[];
  y?: number;
  clearance?: number;
  spacing?: number;
};

export type BlockerInput = {
  boxes?: readonly Box[];
  ramps?: readonly Ramp[];
  volumes?: readonly Volume[];
  zipLines?: readonly ZipLine[];
  boulders?: readonly Boulder[];
  spawns?: readonly SpawnPoint[];
  extra?: readonly Rect[];
  groundY?: number;
  standingHeight?: number;
  spawnRadius?: number;
  boulderRadius?: number;
};

const DEFAULT_CLEARANCE = 1.2;
const DEFAULT_SPACING = 1.7;
const ATTEMPTS_PER_PROP = 24;

export function rect(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX: Math.min(minX, maxX), minZ: Math.min(minZ, maxZ), maxX: Math.max(minX, maxX), maxZ: Math.max(minZ, maxZ) };
}

export function expandRect(area: Rect, amount: number): Rect {
  return { minX: area.minX - amount, minZ: area.minZ - amount, maxX: area.maxX + amount, maxZ: area.maxZ + amount };
}

export function rectContains(area: Rect, x: number, z: number): boolean {
  return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ;
}

export function blockerRects(input: BlockerInput): Rect[] {
  const groundY = input.groundY ?? 0;
  const standing = input.standingHeight ?? 0.4;
  const spawnRadius = input.spawnRadius ?? 4;
  const boulderRadius = input.boulderRadius ?? 2.6;
  const blockers: Rect[] = [];
  for (const box of input.boxes ?? []) {
    if (box.tags.includes("invisible")) continue;
    if (box.max[1] - groundY < standing) continue;
    blockers.push(rect(box.min[0], box.min[2], box.max[0], box.max[2]));
  }
  for (const ramp of input.ramps ?? []) blockers.push(rect(ramp.min[0], ramp.min[2], ramp.max[0], ramp.max[2]));
  for (const volume of input.volumes ?? []) blockers.push(rect(volume.min[0], volume.min[2], volume.max[0], volume.max[2]));
  for (const zip of input.zipLines ?? []) blockers.push(expandRect(rect(zip.from[0], zip.from[2], zip.to[0], zip.to[2]), 1.5));
  for (const boulder of input.boulders ?? []) {
    for (let index = 1; index < boulder.path.length; index += 1) {
      const from = boulder.path[index - 1]!;
      const to = boulder.path[index]!;
      blockers.push(expandRect(rect(from[0], from[2], to[0], to[2]), boulderRadius));
    }
    for (const alcove of boulder.alcoves) blockers.push(rect(alcove.min[0], alcove.min[2], alcove.max[0], alcove.max[2]));
  }
  for (const spawn of input.spawns ?? []) blockers.push(expandRect(rect(spawn.pos[0], spawn.pos[2], spawn.pos[0], spawn.pos[2]), spawnRadius));
  for (const area of input.extra ?? []) blockers.push(area);
  return blockers;
}

function pickKind(kinds: readonly ScatterKind[], roll: number): ScatterKind {
  let total = 0;
  for (const entry of kinds) total += entry.weight;
  let cursor = roll * total;
  for (const entry of kinds) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry;
  }
  return kinds[kinds.length - 1]!;
}

export function scatterProps(options: ScatterOptions): Prop[] {
  if (options.kinds.length === 0 || options.count <= 0) return [];
  const rng = mulberry32(options.seed);
  const clearance = options.clearance ?? DEFAULT_CLEARANCE;
  const spacing = options.spacing ?? DEFAULT_SPACING;
  const y = options.y ?? 0;
  const blockers = options.blockers.map((blocker) => expandRect(blocker, clearance));
  const placed: Prop[] = [];
  for (let index = 0; index < options.count; index += 1) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_PROP; attempt += 1) {
      const x = options.area.minX + rng() * (options.area.maxX - options.area.minX);
      const z = options.area.minZ + rng() * (options.area.maxZ - options.area.minZ);
      if (blockers.some((blocker) => rectContains(blocker, x, z))) continue;
      if (placed.some((prop) => Math.hypot(prop.pos[0] - x, prop.pos[2] - z) < spacing)) continue;
      const chosen = pickKind(options.kinds, rng());
      placed.push({
        kind: chosen.kind,
        pos: [x, y, z],
        yaw: rng() * Math.PI * 2,
        scale: chosen.minScale + rng() * (chosen.maxScale - chosen.minScale),
        seed: options.seed + index * 977 + 13,
      });
      break;
    }
  }
  return placed;
}

export type TreeLineOptions = {
  seed: number;
  outer: Rect;
  depth: number;
  spacing: number;
  kinds?: readonly ScatterKind[];
  y?: number;
  silhouetteRows?: number;
};

const TREE_LINE_KINDS: readonly ScatterKind[] = [
  { kind: "giantTree", weight: 6, minScale: 0.9, maxScale: 1.5 },
  { kind: "palm", weight: 3, minScale: 0.9, maxScale: 1.3 },
  { kind: "fernClump", weight: 2, minScale: 1, maxScale: 1.8 },
];

export function treeLineProps(options: TreeLineOptions): Prop[] {
  const rng = mulberry32(options.seed);
  const kinds = options.kinds ?? TREE_LINE_KINDS;
  const y = options.y ?? 0;
  const rows = 2 + (options.silhouetteRows ?? 1);
  const props: Prop[] = [];
  for (let row = 0; row < rows; row += 1) {
    const band = expandRect(options.outer, options.depth * (row / Math.max(rows - 1, 1)));
    const silhouette = row >= 2;
    const step = options.spacing * (silhouette ? 1.4 : 1);
    const perimeter: Array<readonly [number, number]> = [];
    for (let x = band.minX; x <= band.maxX; x += step) perimeter.push([x, band.minZ], [x, band.maxZ]);
    for (let z = band.minZ + step; z < band.maxZ; z += step) perimeter.push([band.minX, z], [band.maxX, z]);
    for (const [x, z] of perimeter) {
      const chosen = pickKind(kinds, rng());
      const scaleBoost = silhouette ? 1.25 : 1;
      props.push({
        kind: silhouette ? "giantTree" : chosen.kind,
        pos: [x + (rng() - 0.5) * step * 0.6, y, z + (rng() - 0.5) * step * 0.6],
        yaw: rng() * Math.PI * 2,
        scale: (chosen.minScale + rng() * (chosen.maxScale - chosen.minScale)) * scaleBoost,
        seed: options.seed + props.length * 31 + row,
      });
    }
  }
  return props;
}
