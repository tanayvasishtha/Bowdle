import { mulberry32 } from "../math/rng.ts";
import { mirrorX } from "./helpers.ts";
import { blockerRects, expandRect, rect, scatterProps, treeLineProps, type BlockerInput, type Rect, type ScatterKind } from "./scatter.ts";
import type { Box, MaterialName, Prop, Volume } from "./types.ts";

/** Undergrowth only. Nothing tall enough to look like cover: props do not collide,
 *  so a trunk inside the arena would be a wall that arrows fly straight through. */
export const JUNGLE_GROUND_KINDS: readonly ScatterKind[] = [
  { kind: "fernClump", weight: 7, minScale: 0.7, maxScale: 1.3 },
  { kind: "grassPatch", weight: 6, minScale: 0.9, maxScale: 1.6 },
  { kind: "rockPile", weight: 2, minScale: 0.5, maxScale: 0.9 },
  { kind: "fallenLog", weight: 1, minScale: 0.7, maxScale: 1 },
];

export type PatchOptions = {
  idPrefix: string;
  seed: number;
  area: Rect;
  count: number;
  y: number;
  materials: readonly MaterialName[];
};

export function groundPatches(options: PatchOptions): Box[] {
  const rng = mulberry32(options.seed);
  const patches: Box[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const width = 3 + rng() * 7;
    const depth = 3 + rng() * 7;
    const x = options.area.minX + rng() * Math.max(options.area.maxX - options.area.minX - width, 0.1);
    const z = options.area.minZ + rng() * Math.max(options.area.maxZ - options.area.minZ - depth, 0.1);
    const material = options.materials[Math.floor(rng() * options.materials.length)] ?? options.materials[0]!;
    const maxX = Math.min(x + width, options.area.maxX);
    if (maxX - x < 2) continue;
    // Decoration only: no "solid" tag, so patches never collide, never slow the simulation
    // and never count as geometry in the boulder path or spawn checks.
    const patch: Box = {
      id: `${options.idPrefix}-${index}`,
      min: [x, options.y - 0.06, z],
      max: [maxX, options.y, Math.min(z + depth, options.area.maxZ)],
      material,
      tags: [],
    };
    patches.push(patch, mirrorX(patch, `${options.idPrefix}-${index}-mirror`));
  }
  return patches;
}

/** Tall grass is a gameplay volume, not a green box. Fill it with grass the player can read. */
export function grassVolumeProps(options: { volumes: readonly Volume[]; seed: number; spacing?: number }): Prop[] {
  const spacing = options.spacing ?? 1.4;
  const props: Prop[] = [];
  let volumeIndex = 0;
  for (const volume of options.volumes) {
    if (volume.kind !== "tallGrass") continue;
    const rng = mulberry32(options.seed + volumeIndex * 131);
    volumeIndex += 1;
    for (let x = volume.min[0] + spacing / 2; x < volume.max[0]; x += spacing) {
      for (let z = volume.min[2] + spacing / 2; z < volume.max[2]; z += spacing) {
        props.push({
          kind: "grassPatch",
          pos: [x + (rng() - 0.5) * spacing * 0.4, volume.min[1], z + (rng() - 0.5) * spacing * 0.4],
          yaw: rng() * Math.PI * 2,
          scale: 1.3 + rng() * 0.5,
          seed: options.seed + props.length,
        });
      }
    }
  }
  return props;
}

export type DressingOptions = {
  idPrefix: string;
  seed: number;
  bounds: Rect;
  blockers: BlockerInput;
  y?: number;
  scatterCount?: number;
  scatterSpacing?: number;
  treeDepth?: number;
  treeSpacing?: number;
  patchCount?: number;
  patchMaterials?: readonly MaterialName[];
  kinds?: readonly ScatterKind[];
  grassVolumes?: readonly Volume[];
};

export type Dressing = { props: Prop[]; patches: Box[] };

/** Scenery for one map: a tree line outside the play area, scattered undergrowth inside it,
 *  and ground patches that break up the flat floor. Everything is mirrored across x = 0. */
export function jungleDressing(options: DressingOptions): Dressing {
  const y = options.y ?? 0;
  const west = rect(options.bounds.minX, options.bounds.minZ, -0.5, options.bounds.maxZ);
  const blockers = blockerRects({ ...options.blockers, groundY: y });
  const trees = treeLineProps({
    seed: options.seed + 101,
    outer: options.bounds,
    depth: options.treeDepth ?? 9,
    spacing: options.treeSpacing ?? 3.6,
    silhouetteRows: 2,
    y,
  }).filter((prop) => prop.pos[0] <= -0.5);
  const undergrowth = scatterProps({
    seed: options.seed + 211,
    area: expandRect(west, -1.5),
    count: options.scatterCount ?? 150,
    kinds: options.kinds ?? JUNGLE_GROUND_KINDS,
    blockers,
    y,
    spacing: options.scatterSpacing ?? 1.8,
  });
  const grass = grassVolumeProps({
    seed: options.seed + 421,
    volumes: (options.grassVolumes ?? []).filter((volume) => volume.max[0] <= 0.01),
  });
  const props: Prop[] = [];
  for (const prop of [...trees, ...undergrowth, ...grass]) props.push(prop, mirrorX(prop));
  const patches = groundPatches({
    idPrefix: `${options.idPrefix}-patch`,
    seed: options.seed + 317,
    area: rect(options.bounds.minX + 2, options.bounds.minZ + 2, -2, options.bounds.maxZ - 2),
    count: options.patchCount ?? 14,
    y,
    materials: options.patchMaterials ?? ["fern", "stone", "canopy"],
  });
  return { props, patches };
}
