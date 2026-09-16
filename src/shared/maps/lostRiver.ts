import { jungleDressing } from "./dressing.ts";
import { mirrorX } from "./helpers.ts";
import { rect } from "./scatter.ts";
import type { Box, MapData, Prop, Ramp, SpawnPoint, Volume, Waypoint } from "./types.ts";

const boxes: Box[] = [
  { id: "sun-bank", min: [-36, -1, -28], max: [-5, 0, 28], material: "earth", tags: ["solid"] },
  { id: "moon-bank", min: [5, -1, -28], max: [36, 0, 28], material: "earth", tags: ["solid"] },
  { id: "river-bed", min: [-5, -2, -28], max: [5, -1, 28], material: "stone", tags: ["solid"] },
  { id: "river-island", min: [-1, -1, -4], max: [1, 2.8, 4], material: "carvedStone", tags: ["solid", "grapple"] },
  { id: "boundary-west", min: [-36, 0, -28], max: [-34, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-east", min: [34, 0, -28], max: [36, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-south", min: [-36, 0, -28], max: [36, 10, -26], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-north", min: [-36, 0, 26], max: [36, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "ceiling", min: [-36, 13, -28], max: [36, 14, 28], material: "canopy", tags: ["solid", "invisible"] },
  { id: "aqueduct-sun", min: [-14, 4.6, 8.75], max: [-1, 5, 11.25], material: "carvedStone", tags: ["solid", "grapple"] },
  { id: "aqueduct-moon", min: [1, 4.6, 8.75], max: [14, 5, 11.25], material: "carvedStone", tags: ["solid", "grapple"] },
  { id: "aqueduct-pier-sun", min: [-13, -1, 9.25], max: [-11, 4.6, 10.75], material: "stone", tags: ["solid", "grapple"] },
  { id: "aqueduct-pier-moon", min: [11, -1, 9.25], max: [13, 4.6, 10.75], material: "stone", tags: ["solid", "grapple"] },
  { id: "wreck-floor", min: [-7, 0, -7.3], max: [7, 0.2, -4.7], material: "canvas", tags: ["solid"] },
  { id: "wreck-wall-north", min: [-7, 0.2, -7.3], max: [7, 2.6, -7], material: "canvas", tags: ["solid", "grapple"] },
  { id: "wreck-wall-south", min: [-7, 0.2, -5], max: [7, 2.6, -4.7], material: "canvas", tags: ["solid", "grapple"] },
  { id: "wreck-roof", min: [-7, 2.35, -7], max: [7, 2.6, -5], material: "canvas", tags: ["solid", "grapple"] },
  { id: "log-north", min: [-6, -1, 17.5], max: [6, 1, 18.5], material: "wood", tags: ["solid", "grapple"] },
  { id: "log-south", min: [-6, -1, -18.5], max: [6, 1, -17.5], material: "wood", tags: ["solid", "grapple"] },
  { id: "cave-floor", min: [-6, -1, -25], max: [6, 0, -21], material: "stone", tags: ["solid"] },
  { id: "cave-roof", min: [-6, 3, -25], max: [6, 3.5, -21], material: "stone", tags: ["solid", "grapple"] },
];

function pair(box: Box): void { boxes.push(box, mirrorX(box, box.id.replace("sun", "moon"))); }
pair({ id: "sun-gate-north", min: [-25, 0, 5], max: [-23, 5, 7], material: "carvedStone", tags: ["solid", "grapple"] });
pair({ id: "sun-gate-south", min: [-25, 0, -7], max: [-23, 5, -5], material: "carvedStone", tags: ["solid", "grapple"] });
pair({ id: "sun-gate-lintel", min: [-25, 4.5, -5], max: [-23, 5.5, 5], material: "carvedStone", tags: ["solid", "grapple"] });

const ramps: Ramp[] = [];
function rampPair(ramp: Ramp): void { ramps.push(ramp, mirrorX(ramp, ramp.id.replace("sun", "moon"))); }
rampPair({ id: "sun-aqueduct-stair", min: [-20, 0, 9], max: [-14, 5, 11], up: "+x", material: "stone", tags: ["solid"] });
rampPair({ id: "sun-broken-wing", min: [-13, 0, -7], max: [-7, 2.6, -5], up: "+x", material: "canvas", tags: ["solid"] });

const water: Volume = { id: "river", min: [-5, -1, -28], max: [5, -0.4, 28], kind: "water", flood: true };
const sunReedNorth: Volume = { id: "sun-reeds-north", min: [-8, 0, 12], max: [-5, 1.2, 20], kind: "tallGrass" };
const sunReedSouth: Volume = { id: "sun-reeds-south", min: [-8, 0, -20], max: [-5, 1.2, -10], kind: "tallGrass" };
const volumes: Volume[] = [water, sunReedNorth, mirrorX(sunReedNorth, "moon-reeds-north"), sunReedSouth, mirrorX(sunReedSouth, "moon-reeds-south")];

const props: Prop[] = [
  { kind: "planeWreck", pos: [0, 0.2, -6], yaw: Math.PI / 2, scale: 2.2, seed: 1201 },
  { kind: "planeWreck", pos: [0, 0.2, -6], yaw: -Math.PI / 2, scale: 2.2, seed: 1201 },
  { kind: "waterfall", pos: [0, 0, -25], yaw: Math.PI, scale: 2, seed: 1202 },
  { kind: "waterfall", pos: [0, 0, -25], yaw: -Math.PI, scale: 2, seed: 1202 },
  { kind: "waterSurface", pos: [0, -0.38, 2], yaw: 0, scale: 6, seed: 1203 },
  { kind: "mist", pos: [0, 0, -23], yaw: 0, scale: 2, seed: 1204 },
];
for (const [x, z, seed] of [[-27, 16, 1210], [-19, -15, 1211], [-9, 22, 1212]] as const) {
  const tree: Prop = { kind: "giantTree", pos: [x, 0, z], yaw: 0.2, scale: 1.2, seed };
  props.push(tree, mirrorX(tree));
}
for (const z of [10, -10] as const) {
  const head: Prop = { kind: "stoneHead", pos: [-17, 0, z], yaw: -Math.PI / 2, scale: 1, seed: 1230 + z };
  props.push(head, mirrorX(head));
}

const sunSpawns: SpawnPoint[] = [-6, -2, 2, 6].map((z) => ({ pos: [-30, 0, z], yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({ pos: [30, 0, spawn.pos[2]], yaw: Math.PI / 2 }));
const waypoints: Waypoint[] = [];
const links = new Map<string, Array<{ to: string; kind: "walk" | "jump" | "drop" | "zip" | "grapple" }>>();
function node(id: string, x: number, y: number, z: number): void { waypoints.push({ id, pos: [x, y, z], links: [] }); }
function connect(a: string, b: string, kind: "walk" | "jump" | "drop" | "zip" | "grapple" = "jump"): void { const left = links.get(a) ?? []; left.push({ to: b, kind }); links.set(a, left); const right = links.get(b) ?? []; right.push({ to: a, kind }); links.set(b, right); }
for (let index = 0; index < 4; index += 1) { node(`sun-spawn-${index}`, ...sunSpawns[index]!.pos); node(`moon-spawn-${index}`, ...moonSpawns[index]!.pos); }
for (const [id, x, y, z] of [
  ["sun-hub",-27,0,0],["moon-hub",27,0,0],
  ["sun-aqueduct-low",-20,0,10],["sun-aqueduct-high",-14,5,10],["aqueduct-sun-gap",-1,5,10],["aqueduct-moon-gap",1,5,10],["moon-aqueduct-high",14,5,10],["moon-aqueduct-low",20,0,10],
  ["sun-wreck",-12,0,-6],["wreck-sun",-6,0.2,-6],["wreck-moon",6,0.2,-6],["moon-wreck",12,0,-6],
  ["sun-log-north",-8,0,18],["log-north-sun",-5.5,1,18],["log-north-moon",5.5,1,18],["moon-log-north",8,0,18],
  ["sun-log-south",-8,0,-18],["log-south-sun",-5.5,1,-18],["log-south-moon",5.5,1,-18],["moon-log-south",8,0,-18],
  ["sun-cave",-8,0,-23],["cave-sun",-5.5,0,-23],["cave-moon",5.5,0,-23],["moon-cave",8,0,-23],
  ["river-sun",-4,-1,6],["river-north",0,-1,7],["river-moon",4,-1,6],
] as const) node(id, x, y, z);
for (let index = 0; index < 4; index += 1) { connect(`sun-spawn-${index}`, "sun-hub"); connect(`moon-spawn-${index}`, "moon-hub"); }
for (const chain of [
  ["sun-hub","sun-aqueduct-low","sun-aqueduct-high","aqueduct-sun-gap","aqueduct-moon-gap","moon-aqueduct-high","moon-aqueduct-low","moon-hub"],
  ["sun-hub","sun-wreck","wreck-sun","wreck-moon","moon-wreck","moon-hub"],
  ["sun-hub","sun-log-north","log-north-sun","log-north-moon","moon-log-north","moon-hub"],
  ["sun-hub","sun-log-south","log-south-sun","log-south-moon","moon-log-south","moon-hub"],
  ["sun-hub","sun-cave","cave-sun","cave-moon","moon-cave","moon-hub"],
  ["sun-hub","river-sun","river-north","river-moon","moon-hub"],
]) for (let index = 1; index < chain.length; index += 1) connect(chain[index - 1]!, chain[index]!);
for (let index = 0; index < waypoints.length; index += 1) waypoints[index] = { ...waypoints[index]!, links: links.get(waypoints[index]!.id) ?? [] };

const dressing = jungleDressing({
  idPrefix: "river",
  seed: 6301,
  bounds: rect(-34, -26, 34, 26),
  blockers: { boxes, ramps, volumes, spawns: [...sunSpawns, ...moonSpawns] },
  patchMaterials: ["fern", "canopy", "earth"],
  grassVolumes: volumes,
  scatterCount: 130,
});
props.push(...dressing.props);
boxes.push(...dressing.patches);

export const lostRiverMap: MapData = {
  id: "lost-river", name: "Lost River", bounds: { min: [-36, -2, -28], max: [36, 14, 28] }, boxes, ramps, volumes, zipLines: [], boulders: [], props,
  spawns: { sun: sunSpawns, moon: moonSpawns }, waypoints, decor: [], notes: [{ text: "flood every two minutes", pos: [0, 3, 4] }, { text: "behind the falls", pos: [0, 3, -22] }], look: { sunShafts: true, stainSeed: 6301 },
};
