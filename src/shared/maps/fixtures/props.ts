import type { MapData, PropKind } from "../types.ts";

export const PROP_KINDS: readonly PropKind[] = [
  "giantTree", "palm", "fernClump", "grassPatch", "fallenLog", "rockPile", "templeBlock", "pillar", "brokenPillar", "stepTier", "sunDisc", "stoneHead", "torch", "brazier", "ropeBridge", "zipRope", "lever", "vineWall", "waterfall", "waterSurface", "mist", "tent", "crate", "lantern", "mapTable", "planeWreck",
];

const props = PROP_KINDS.map((kind, index) => ({ kind, pos: [((index % 5) - 2) * 7, 0, 14 - Math.floor(index / 5) * 7] as const, yaw: 0, scale: kind === "giantTree" ? 0.65 : 1, seed: 300 + index }));

export const propsGalleryMap: MapData = {
  id: "props", name: "Field Guide Specimens", bounds: { min: [-20, -2, -24], max: [20, 16, 32] },
  boxes: [{ id: "clearing", min: [-20, -1, -24], max: [20, 0, 32], material: "earth", tags: ["solid"] }],
  ramps: [], volumes: [], zipLines: [], boulders: [], props,
  spawns: { sun: [{ pos: [0, 0, 27], yaw: 0 }], moon: [] }, waypoints: [], decor: [],
  notes: props.map((prop) => ({ text: prop.kind, pos: [prop.pos[0], prop.kind === "giantTree" ? 9 : 4, prop.pos[2]] })),
  look: { sunShafts: true, stainSeed: 3303 },
};
