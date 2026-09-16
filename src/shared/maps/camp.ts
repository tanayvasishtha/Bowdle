import { CROUCH_HEIGHT, PLAYER_WIDTH, PRACTICE_PATROL_HALF_WIDTH, PRACTICE_PATROL_SPEED, STAND_HEIGHT, STEP_HEIGHT } from "../constants.ts";
import { stairs } from "./helpers.ts";
import type { MapData, Vec3Tuple } from "./types.ts";

export type CampTarget = { id: string; pos: Vec3Tuple; speed: number; railHalfWidth?: number };

export const campTargets: readonly CampTarget[] = [
  { id: "target-10", pos: [0, 0, -10], speed: 0 }, { id: "target-20", pos: [0, 0, -20], speed: 0 },
  { id: "target-30", pos: [0, 0, -30], speed: 0 }, { id: "target-45", pos: [0, 0, -45], speed: 0 },
  { id: "target-60", pos: [0, 0, -60], speed: 0 }, { id: "moving-25", pos: [0, 0, -25], speed: 4 },
  { id: "moving-40", pos: [0, 0, -40], speed: 7 },
  { id: "stealth-patrol", pos: [9, 0, -55], speed: PRACTICE_PATROL_SPEED, railHalfWidth: PRACTICE_PATROL_HALF_WIDTH },
];

export const campMap: MapData = {
  id: "camp", name: "Practice Camp", bounds: { min: [-16, -2, -82], max: [16, 10, 10] },
  boxes: [
    { id: "floor", min: [-16, -1, -82], max: [16, 0, 10], material: "earth", tags: ["solid"] },
    { id: "wall-west", min: [-16, 0, -82], max: [-15.5, 6, 10], material: "foliageDark", tags: ["solid"] },
    { id: "wall-east", min: [15.5, 0, -82], max: [16, 6, 10], material: "foliageDark", tags: ["solid"] },
    { id: "backstop", min: [-16, 0, -82], max: [16, 7, -81.5], material: "stone", tags: ["solid"] },
    { id: "watchtower", min: [-14, 0, -7], max: [-10, 6, -3], material: "wood", tags: ["solid", "grapple"] },
    { id: "vine-wall", min: [10, 0, -18], max: [14, 7, -17], material: "gold", tags: ["solid", "grapple"] },
    { id: "slide-log-1", min: [-9, CROUCH_HEIGHT + 0.1, -13], max: [-3, CROUCH_HEIGHT + 0.3, -12.5], material: "wood", tags: ["solid"] },
    { id: "slide-log-2", min: [-9, CROUCH_HEIGHT + 0.1, -21], max: [-3, CROUCH_HEIGHT + 0.3, -20.5], material: "wood", tags: ["solid"] },
    { id: "boulder-alcove", min: [8, 0, -36], max: [12, 3, -32], material: "stone", tags: ["solid"] },
    ...stairs({ idPrefix: "tower-step", start: [-10, 0, -2], dir: "-z", steps: 10, rise: STEP_HEIGHT, run: 0.7, width: PLAYER_WIDTH * 4, material: "wood" }),
  ],
  ramps: [],
  volumes: [
    { id: "creek", min: [-15, 0, -52], max: [15, 0.6, -48], kind: "water" },
    { id: "stealth-grass", min: [5, 0, -58], max: [14, 1.2, -52], kind: "tallGrass" },
  ],
  zipLines: [{ id: "camp-zip", from: [-12, 6, -5], to: [-2, 1, -28] }],
  boulders: [{ id: "camp-boulder", path: [[5, 1.5, -40], [13, 1.5, -40]], lever: [3, 0.8, -40], alcoves: [{ min: [8, 0, -36], max: [12, 3, -32] }] }],
  props: [
    { kind: "tent", pos: [8, 0, 4], yaw: 0.2, scale: 1.2, seed: 1401 }, { kind: "mapTable", pos: [2, 0, 5], yaw: 0, scale: 1, seed: 1402 },
    { kind: "zipRope", pos: [-7, 3.5, -16], yaw: -0.4, scale: 4, seed: 1403 }, { kind: "vineWall", pos: [12, 0, -17], yaw: 0, scale: 1.5, seed: 1404 },
    { kind: "lever", pos: [3, 0, -40], yaw: 0, scale: 1, seed: 1405 }, { kind: "fallenLog", pos: [-6, 0, -13], yaw: Math.PI / 2, scale: 1.4, seed: 1406 },
    { kind: "waterSurface", pos: [0, 0.62, -50], yaw: 0, scale: 5, seed: 1407 }, { kind: "grassPatch", pos: [9, 0, -55], yaw: 0, scale: 2, seed: 1408 },
  ],
  spawns: { sun: [{ pos: [0, 0, 0], yaw: 0 }], moon: [] },
  waypoints: [{ id: "camp-spawn", pos: [0, 0, 0], links: [] }], decor: [],
  notes: [{ text: "watchtower zip", pos: [-10, 7, -5] }, { text: "gold vine", pos: [12, 7, -17] }, { text: "stealth creek", pos: [9, 2, -52] }],
  look: { sunShafts: true, stainSeed: 7401 },
};

export const campTargetHeight = STAND_HEIGHT;
