import { rect, treeLineProps } from "../scatter.ts";
import type { MapData } from "../types.ts";

/** A plain clearing for the crew lineup scene. Only the far half of the tree line is kept so the camera sees in. */
export const lineupMap: MapData = {
  id: "lineup",
  name: "Crew Lineup",
  bounds: { min: [-18, -2, -16], max: [18, 14, 12] },
  boxes: [{ id: "clearing", min: [-18, -1, -16], max: [18, 0, 12], material: "earth", tags: ["solid"] }],
  ramps: [],
  volumes: [],
  zipLines: [],
  boulders: [],
  props: treeLineProps({ seed: 9101, outer: rect(-15, -11, 15, 9), depth: 6, spacing: 3.8 }).filter((prop) => prop.pos[2] < -4),
  spawns: { sun: [{ pos: [0, 0, 8], yaw: 0 }], moon: [] },
  waypoints: [],
  decor: [],
  notes: [],
  look: { sunShafts: true, stainSeed: 9101 },
};
