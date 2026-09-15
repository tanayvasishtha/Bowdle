import { mirrorX } from "../helpers.ts";
import type { Boulder, Box, MapData, Prop, Ramp, Volume, ZipLine } from "../types.ts";

const floor: Box = { id: "floor", min: [-20, -1, -15], max: [20, 0, 15], material: "earth", tags: ["solid"] };
const platform: Box = { id: "platform", min: [-4, 0, -3], max: [4, 2, 3], material: "carvedStone", tags: ["solid", "grapple"] };
const sightBlocker: Box = { id: "sight-blocker", min: [-1, 0, 6], max: [1, 3, 10], material: "stone", tags: ["solid"] };
const sunRamp: Ramp = { id: "sun-ramp", min: [-8, 0, -2], max: [-4, 2, 2], up: "+x", material: "stone", tags: ["solid"] };
const sunWater: Volume = { id: "sun-water", min: [-13, 0, -13], max: [-9, 1, -9], kind: "water", flood: true };
const sunZip: ZipLine = { id: "sun-zip", from: [-12, 7, -10], to: [-5, 3, -10] };
const boulder: Boulder = {
  id: "center-boulder",
  path: [[-8, 1.51, -6], [8, 1.51, -6]],
  lever: [0, 1, -3],
  alcoves: [{ min: [-3, 0, -2], max: [-1, 2, 0] }, { min: [1, 0, -2], max: [3, 2, 0] }],
};
const sunProp: Prop = { kind: "palm", pos: [-15, 0, 12], yaw: 0.4, scale: 1, seed: 17 };

export const kitMap: MapData = {
  id: "kit",
  name: "Jungle Map Kit",
  bounds: { min: [-20, -2, -15], max: [20, 12, 15] },
  boxes: [floor, platform, sightBlocker],
  ramps: [sunRamp, mirrorX(sunRamp, "moon-ramp")],
  volumes: [sunWater, mirrorX(sunWater, "moon-water"), { id: "center-grass", min: [-2, 0, 11], max: [2, 1.4, 14], kind: "tallGrass" }],
  zipLines: [sunZip, mirrorX(sunZip, "moon-zip")],
  boulders: [boulder],
  props: [sunProp, mirrorX(sunProp), { kind: "stoneHead", pos: [0, 0, -12], yaw: 0, scale: 1, seed: 23 }],
  spawns: { sun: [{ pos: [-15, 0, 8], yaw: -Math.PI / 2 }], moon: [{ pos: [15, 0, 8], yaw: Math.PI / 2 }] },
  waypoints: [
    { id: "sun-spawn", pos: [-15, 0, 8], links: [{ to: "center", kind: "jump" }, { to: "sun-zip-high", kind: "zip" }] },
    { id: "sun-zip-high", pos: [-12, 0, -10], links: [{ to: "sun-spawn", kind: "jump" }, { to: "sun-zip-low", kind: "zip" }] },
    { id: "sun-zip-low", pos: [-5, 0, -10], links: [{ to: "center", kind: "jump" }] },
    { id: "center", pos: [0, 2, 0], links: [{ to: "sun-spawn", kind: "jump" }, { to: "moon-spawn", kind: "jump" }] },
    { id: "moon-zip-low", pos: [5, 0, -10], links: [{ to: "center", kind: "jump" }] },
    { id: "moon-zip-high", pos: [12, 0, -10], links: [{ to: "moon-spawn", kind: "jump" }, { to: "moon-zip-low", kind: "zip" }] },
    { id: "moon-spawn", pos: [15, 0, 8], links: [{ to: "center", kind: "jump" }, { to: "moon-zip-high", kind: "zip" }] },
  ],
  decor: [],
  notes: [{ text: "ALL SYSTEMS", pos: [0, 2.05, 0] }],
  look: { sunShafts: true, stainSeed: 2026 },
};
