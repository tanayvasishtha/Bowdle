import { CROUCH_HEIGHT, PLAYER_WIDTH, STAND_HEIGHT, STEP_HEIGHT } from "../constants.ts";
import { stairs } from "./helpers.ts";
import type { MapData, Vec3Tuple } from "./types.ts";

export type PracticeTarget = { id: string; pos: Vec3Tuple; speed: number };

export const practiceTargets: readonly PracticeTarget[] = [
  { id: "target-10", pos: [0, 0, -10], speed: 0 },
  { id: "target-20", pos: [0, 0, -20], speed: 0 },
  { id: "target-30", pos: [0, 0, -30], speed: 0 },
  { id: "target-45", pos: [0, 0, -45], speed: 0 },
  { id: "target-60", pos: [0, 0, -60], speed: 0 },
  { id: "moving-25", pos: [0, 0, -25], speed: 4 },
  { id: "moving-40", pos: [0, 0, -40], speed: 7 },
];

export const rangeMap: MapData = {
  id: "range",
  name: "Practice Range",
  bounds: { min: [-12, -1, -82], max: [12, 8, 8] },
  boxes: [
    { id: "floor", min: [-12, -1, -82], max: [12, 0, 8], material: "earth", tags: ["solid"] },
    { id: "wall-west", min: [-12, 0, -82], max: [-11.5, 5, 8], material: "stone", tags: ["solid"] },
    { id: "wall-east", min: [11.5, 0, -82], max: [12, 5, 8], material: "stone", tags: ["solid"] },
    { id: "backstop", min: [-12, 0, -82], max: [12, 6, -81.5], material: "stone", tags: ["solid"] },
    { id: "slide-bar-1", min: [-10, CROUCH_HEIGHT + 0.1, -12], max: [-5, CROUCH_HEIGHT + 0.3, -11.5], material: "wood", tags: ["solid"] },
    { id: "slide-bar-2", min: [-10, CROUCH_HEIGHT + 0.1, -20], max: [-5, CROUCH_HEIGHT + 0.3, -19.5], material: "wood", tags: ["solid"] },
    ...stairs({ idPrefix: "stepup", start: [6, 0, -8], dir: "-z", steps: 5, rise: STEP_HEIGHT, run: 1, width: PLAYER_WIDTH * 4, material: "stone" }),
  ],
  ramps: [], volumes: [], zipLines: [], boulders: [], props: [],
  spawns: { sun: [{ pos: [0, 0, 0], yaw: 0 }], moon: [] },
  waypoints: [{ id: "range-spawn", pos: [0, 0, 0], links: [] }],
  decor: [],
  notes: [{ text: "practice trail", pos: [0, 3, -12] }, { text: "long shot", pos: [0, 3, -45] }],
  look: { sunShafts: true, stainSeed: 211 },
};

export const practiceTargetHeight = STAND_HEIGHT;
