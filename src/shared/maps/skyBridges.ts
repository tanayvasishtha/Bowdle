import { jungleDressing } from "./dressing.ts";
import { mirrorX } from "./helpers.ts";
import { rect } from "./scatter.ts";
import type { Box, MapData, Prop, Ramp, SpawnPoint, Volume, Waypoint, ZipLine } from "./types.ts";

const boxes: Box[] = [
  { id: "floor", min: [-36, -1, -26], max: [36, 0, 26], material: "earth", tags: ["solid"] },
  { id: "great-tree", min: [-2, 0, -2], max: [2, 14, 2], material: "wood", tags: ["solid", "grapple"] },
  { id: "great-root-x", min: [-7, 0, -1], max: [7, 3, 1], material: "wood", tags: ["solid", "grapple"] },
  { id: "great-root-z", min: [-1, 0, -8], max: [1, 3, 8], material: "wood", tags: ["solid", "grapple"] },
  { id: "boundary-west", min: [-36, 0, -26], max: [-34, 12, 26], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-east", min: [34, 0, -26], max: [36, 12, 26], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-south", min: [-36, 0, -26], max: [36, 12, -24], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-north", min: [-36, 0, 24], max: [36, 12, 26], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "ceiling", min: [-36, 16, -26], max: [36, 17, 26], material: "canopy", tags: ["solid", "invisible"] },
];
function addPair(box: Box): void { boxes.push(box, mirrorX(box, box.id.replace("sun", "moon"))); }
for (const level of [{ name: "low", minY: 4.5, maxY: 4.8 }, { name: "high", minY: 8.5, maxY: 8.8 }]) {
  boxes.push(
    { id: `${level.name}-ring-n`, min: [-5, level.minY, 2], max: [5, level.maxY, 5], material: "wood", tags: ["solid", "grapple"] },
    { id: `${level.name}-ring-s`, min: [-5, level.minY, -5], max: [5, level.maxY, -2], material: "wood", tags: ["solid", "grapple"] },
    { id: `${level.name}-ring-w`, min: [-5, level.minY, -2], max: [-2, level.maxY, 2], material: "wood", tags: ["solid", "grapple"] },
    { id: `${level.name}-ring-e`, min: [2, level.minY, -2], max: [5, level.maxY, 2], material: "wood", tags: ["solid", "grapple"] },
  );
}
const sunTrunks = [{ id: "sun-west-tree", x: -15, z: 0 }, { id: "sun-north-tree", x: -15, z: 16 }, { id: "sun-south-tree", x: -15, z: -16 }, { id: "sun-spawn-tree", x: -28, z: 0 }];
for (const tree of sunTrunks) addPair({ id: tree.id, min: [tree.x - 1.5, 0, tree.z - 1.5], max: [tree.x + 1.5, tree.id.includes("spawn") ? 10 : 12, tree.z + 1.5], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-west-low", min: [-18.5, 4.5, -3.5], max: [-11.5, 4.8, 3.5], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-west-high", min: [-17.5, 8.5, -2.5], max: [-12.5, 8.8, 2.5], material: "wood", tags: ["solid", "grapple"] });
for (const z of [16, -16]) addPair({ id: `sun-${z > 0 ? "north" : "south"}-deck`, min: [-18.5, 4.5, z - 3.5], max: [-11.5, 4.8, z + 3.5], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-high-bridge", min: [-12.5, 8.5, -1], max: [-5, 8.8, 1], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-center-low-bridge", min: [-11.5, 4.5, -1], max: [-5, 4.8, 1], material: "wood", tags: ["solid", "grapple"] });
for (const side of [1, -1]) addPair({ id: `sun-${side > 0 ? "north" : "south"}-bridge`, min: [-16.5, 4.5, side > 0 ? 3.5 : -12.5], max: [-13.5, 4.8, side > 0 ? 12.5 : -3.5], material: "wood", tags: ["solid", "grapple"] });
boxes.push({ id: "low-ramp-landing", min: [-3, 4.5, 5], max: [3, 4.8, 17], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-high-ramp-landing", min: [-18.5, 4.5, 3.5], max: [-16.5, 4.8, 9], material: "wood", tags: ["solid", "grapple"] });

const ramps: Ramp[] = [];
function addRampPair(ramp: Ramp): void { ramps.push(ramp, mirrorX(ramp, ramp.id.replace("sun", "moon"))); }
addRampPair({ id: "sun-west-low-ramp", min: [-24.5, 0, -1], max: [-18.5, 4.8, 1], up: "+x", material: "wood", tags: ["solid"] });
addRampPair({ id: "sun-west-high-ramp", min: [-17.5, 4.8, 2.5], max: [-16.7, 8.8, 8.5], up: "-z", material: "wood", tags: ["solid"] });
addRampPair({ id: "sun-ring-low-ramp", min: [-5, 0, 5], max: [-3, 4.8, 19], up: "-z", material: "wood", tags: ["solid"] });
ramps.push({ id: "ring-high-ramp", min: [-1, 4.8, 5], max: [1, 8.8, 17], up: "-z", material: "wood", tags: ["solid"] });

const stream: Volume = { id: "stream", min: [-34, 0, -22], max: [34, 0.65, -18], kind: "water" };
const sunGrassNorth: Volume = { id: "sun-grass-north", min: [-24, 0, 6], max: [-8, 1.2, 12], kind: "tallGrass" };
const sunGrassSouth: Volume = { id: "sun-grass-south", min: [-24, 0, -12], max: [-8, 1.2, -6], kind: "tallGrass" };
const volumes: Volume[] = [stream, sunGrassNorth, mirrorX(sunGrassNorth, "moon-grass-north"), sunGrassSouth, mirrorX(sunGrassSouth, "moon-grass-south")];
const sunZipNorth: ZipLine = { id: "sun-zip-north", from: [-3, 8.8, 5], to: [-15, 4.8, 13] };
const sunZipSouth: ZipLine = { id: "sun-zip-south", from: [-3, 8.8, -5], to: [-15, 4.8, -13] };
const zipLines: ZipLine[] = [sunZipNorth, mirrorX(sunZipNorth, "moon-zip-north"), sunZipSouth, mirrorX(sunZipSouth, "moon-zip-south")];

const props: Prop[] = [{ kind: "giantTree", pos: [0, 0, 0], yaw: 0, scale: 1.7, seed: 801 }, { kind: "waterfall", pos: [0, 0, 23.5], yaw: 0, scale: 2, seed: 802 }, { kind: "waterSurface", pos: [0, 0.67, -20], yaw: 0, scale: 4, seed: 803 }, { kind: "mist", pos: [0, 0, 22], yaw: 0, scale: 2, seed: 804 }];
for (const tree of sunTrunks) { const prop: Prop = { kind: "giantTree", pos: [tree.x, 0, tree.z], yaw: 0.15, scale: tree.id.includes("spawn") ? 1.2 : 1.4, seed: 820 + tree.z }; props.push(prop, mirrorX(prop)); }
for (const [x, z] of [[-24, -8], [-20, 5], [-9, -15]] as const) { const log: Prop = { kind: "fallenLog", pos: [x, 0, z], yaw: 0.4, scale: 1, seed: 900 + z }; props.push(log, mirrorX(log)); }
for (const zip of [sunZipNorth, sunZipSouth]) { const rope: Prop = { kind: "zipRope", pos: [(zip.from[0] + zip.to[0]) / 2, 6.8, (zip.from[2] + zip.to[2]) / 2], yaw: 0.9, scale: 2.4, seed: 920 + zip.from[2] }; props.push(rope, mirrorX(rope)); }

const sunSpawns: SpawnPoint[] = [-6, -2, 2, 6].map((z) => ({ pos: [-30, 0, z], yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({ pos: [30, 0, spawn.pos[2]], yaw: Math.PI / 2 }));
const waypoints: Waypoint[] = []; const links = new Map<string, Array<{ to: string; kind: "walk" | "jump" | "drop" | "zip" | "grapple" }>>();
function node(id: string, x: number, y: number, z: number): void { waypoints.push({ id, pos: [x, y, z], links: [] }); }
function connect(a: string, b: string, kind: "walk" | "jump" | "drop" | "zip" | "grapple" = "walk", reverse = true): void { const left = links.get(a) ?? []; left.push({ to: b, kind }); links.set(a, left); if (reverse) { const right = links.get(b) ?? []; right.push({ to: a, kind }); links.set(b, right); } }
for (let i = 0; i < 4; i += 1) { node(`sun-spawn-${i}`, ...sunSpawns[i]!.pos); node(`moon-spawn-${i}`, ...moonSpawns[i]!.pos); }
for (const [id,x,y,z] of [
  ["sun-exit",-24.5,0,-6],["sun-hub",-24.5,0,0],["sun-west-ramp-low",-24.5,0,0],["sun-west-low",-18.5,4.8,0],["sun-low-nw",-18,4.8,3],["sun-high-approach",-18,4.8,8.5],["sun-low-nbridge",-15,4.8,4],["sun-low-ne",-12,4.8,3],["sun-low-sw",-18,4.8,-3],["sun-low-sbridge",-15,4.8,-4],["sun-west-low-center",-11.5,4.8,0],["sun-west-high-low",-17.1,4.8,8.5],["sun-west-high",-17.1,8.8,2.5],["sun-high-east",-12.8,8.8,2.2],["sun-high-bridge",-12.5,8.8,0],["sun-north-deck",-15,4.8,12.5],["sun-south-deck",-15,4.8,-12.5],
  ["moon-exit",24.5,0,-6],["moon-hub",24.5,0,0],["moon-west-ramp-low",24.5,0,0],["moon-west-low",18.5,4.8,0],["moon-low-nw",18,4.8,3],["moon-high-approach",18,4.8,8.5],["moon-low-nbridge",15,4.8,4],["moon-low-ne",12,4.8,3],["moon-low-sw",18,4.8,-3],["moon-low-sbridge",15,4.8,-4],["moon-west-low-center",11.5,4.8,0],["moon-west-high-low",17.1,4.8,8.5],["moon-west-high",17.1,8.8,2.5],["moon-high-east",12.8,8.8,2.2],["moon-high-bridge",12.5,8.8,0],["moon-north-deck",15,4.8,12.5],["moon-south-deck",15,4.8,-12.5],
  ["sun-ring-ground-west",-23,0,19],["sun-ring-ground-approach",-10,0,19],["sun-ring-ramp-low",-4,0,19],["sun-ring-ramp-high",-4,4.8,5],["center-low",-5,4.8,0],["ring-low-north",0,4.8,5],["center-low-east",5,4.8,0],["moon-ring-ramp-high",4,4.8,5],["ring-high-approach",2.2,4.8,17],["ring-high-low",0,4.8,17],["ring-high-west",-5,8.8,0],["ring-high-nw",-4,8.8,3],["center-high",0,8.8,5],["ring-high-east",5,8.8,0],["ring-high-ne",4,8.8,3],["ring-high-sw",-4,8.8,-3],["ring-high-se",4,8.8,-3],["moon-ring-ramp-low",4,0,19],["moon-ring-ground-approach",10,0,19],["moon-ring-ground-west",23,0,19],
  ["sun-zip-north-high",-3,8.8,5],["sun-zip-south-high",-3,8.8,-5],["moon-zip-north-high",3,8.8,5],["moon-zip-south-high",3,8.8,-5],
  ["sun-grass-north",-20,0,9],["sun-grass-south",-20,0,-9],["moon-grass-north",20,0,9],["moon-grass-south",20,0,-9],
  // Ground routes around the narrow west ramps: the wedge is solid, so bots under the decks walk round it.
  ["sun-under-deck",-17,0,-3.5],["sun-ramp-side",-24.5,0,-2.6],["moon-under-deck",17,0,-3.5],["moon-ramp-side",24.5,0,-2.6],
] as const) node(id, x, y, z);
connect("sun-spawn-0","sun-exit"); connect("sun-exit","sun-hub"); connect("moon-spawn-0","moon-exit"); connect("moon-exit","moon-hub");
connect("sun-hub","sun-ramp-side"); connect("sun-ramp-side","sun-under-deck"); connect("sun-under-deck","sun-grass-south"); connect("moon-hub","moon-ramp-side"); connect("moon-ramp-side","moon-under-deck"); connect("moon-under-deck","moon-grass-south");
connect("sun-hub","sun-grass-north"); connect("sun-hub","sun-grass-south"); connect("moon-hub","moon-grass-north"); connect("moon-hub","moon-grass-south");
for (let i = 1; i < 4; i += 1) { connect(`sun-spawn-${i}`, "sun-hub", "jump"); connect(`moon-spawn-${i}`, "moon-hub", "jump"); }
for (const chain of [
  ["sun-hub","sun-west-ramp-low","sun-west-low","sun-low-nw","sun-high-approach","sun-west-high-low","sun-west-high","sun-high-east","sun-high-bridge","ring-high-west","ring-high-nw","center-high"],
  ["moon-hub","moon-west-ramp-low","moon-west-low","moon-low-nw","moon-high-approach","moon-west-high-low","moon-west-high","moon-high-east","moon-high-bridge","ring-high-east","ring-high-ne","center-high"],
  ["sun-low-nbridge","sun-north-deck"],["sun-west-low","sun-low-sw","sun-low-sbridge","sun-south-deck"],["moon-low-nbridge","moon-north-deck"],["moon-west-low","moon-low-sw","moon-low-sbridge","moon-south-deck"],
  ["sun-low-nbridge","sun-low-ne","sun-west-low-center","center-low","sun-ring-ramp-high","ring-low-north","ring-high-approach","ring-high-low","center-high"],
  ["moon-low-nbridge","moon-low-ne","moon-west-low-center","center-low-east","moon-ring-ramp-high","ring-low-north"],
] ) for (let i = 1; i < chain.length; i += 1) connect(chain[i-1]!, chain[i]!);
connect("sun-hub","sun-ring-ground-west"); connect("sun-ring-ground-west","sun-ring-ground-approach"); connect("sun-ring-ground-approach","sun-ring-ramp-low"); connect("sun-ring-ramp-low","sun-ring-ramp-high");
connect("moon-hub","moon-ring-ground-west"); connect("moon-ring-ground-west","moon-ring-ground-approach"); connect("moon-ring-ground-approach","moon-ring-ramp-low"); connect("moon-ring-ramp-low","moon-ring-ramp-high");
connect("center-high","sun-zip-north-high"); connect("center-high","moon-zip-north-high"); connect("center-high","ring-high-nw"); connect("ring-high-nw","ring-high-west"); connect("ring-high-west","ring-high-sw"); connect("ring-high-sw","sun-zip-south-high"); connect("center-high","ring-high-ne"); connect("ring-high-ne","ring-high-east"); connect("ring-high-east","ring-high-se"); connect("ring-high-se","moon-zip-south-high");
connect("sun-zip-north-high","sun-north-deck","zip",false); connect("sun-zip-south-high","sun-south-deck","zip",false); connect("moon-zip-north-high","moon-north-deck","zip",false); connect("moon-zip-south-high","moon-south-deck","zip",false);
connect("center-high","center-low","drop"); connect("sun-west-low-center","center-high","grapple"); connect("moon-west-low-center","center-high","grapple");
for (let i = 0; i < waypoints.length; i += 1) waypoints[i] = { ...waypoints[i]!, links: links.get(waypoints[i]!.id) ?? [] };

for (const z of [-8.5, 8.5]) {
  const tent: Prop = { kind: "tent", pos: [-32, 0, z], yaw: 0.4, scale: 1, seed: 960 + z };
  const hut: Box = { id: `sun-hut-${z}`, min: [-33.4, 0, z - 1.4], max: [-30.6, 2.2, z + 1.4], material: "canvas", tags: ["solid", "invisible"] };
  props.push(tent, mirrorX(tent));
  boxes.push(hut, mirrorX(hut, hut.id.replace("sun", "moon")));
}
for (const [x, z] of [[-17.5, -2.8], [-12.5, 2.8], [-17.5, 13], [-17.5, -13]] as const) {
  const lantern: Prop = { kind: "lantern", pos: [x, 4.8, z], yaw: 0, scale: 0.8, seed: 980 + x + z };
  props.push(lantern, mirrorX(lantern));
}

const dressing = jungleDressing({
  idPrefix: "sky-bridges",
  seed: 6101,
  bounds: rect(-34, -24, 34, 24),
  blockers: { boxes, ramps, volumes, zipLines, spawns: [...sunSpawns, ...moonSpawns] },
  patchMaterials: ["fern", "canopy", "stone"],
  grassVolumes: volumes,
  treeSpacing: 4,
  scatterCount: 120,
});
props.push(...dressing.props);
boxes.push(...dressing.patches);

export const skyBridgesMap: MapData = { relic: [0, 4.8, 5], camps: { sun: { min: [-34, -1.5, -9], max: [-25, 4, 9] }, moon: { min: [25, -1.5, -9], max: [34, 4, 9] } }, id: "sky-bridges", name: "Sky Bridges", bounds: { min: [-36,-2,-26], max: [36,17,26] }, boxes, ramps, volumes, zipLines, boulders: [], props, spawns: { sun: sunSpawns, moon: moonSpawns }, waypoints, anchors: [
    { id: "sun-anchor-n", pos: [-10, 10, 6], sway: { axis: "x", amplitude: 1.2, periodS: 4 } },
    { id: "moon-anchor-n", pos: [10, 10, 6], sway: { axis: "x", amplitude: 1.2, periodS: 4 } },
    { id: "sun-anchor-s", pos: [-10, 10, -6], sway: { axis: "z", amplitude: 1.0, periodS: 5 } },
    { id: "moon-anchor-s", pos: [10, 10, -6], sway: { axis: "z", amplitude: 1.0, periodS: 5 } },
    { id: "sun-anchor-mid", pos: [-6, 12, 0], sway: { axis: "y", amplitude: 0.8, periodS: 3.5 } },
    { id: "moon-anchor-mid", pos: [6, 12, 0], sway: { axis: "y", amplitude: 0.8, periodS: 3.5 } },
  ],
  geysers: [
    { id: "sun-geyser", pos: [-4, 0, 0], radius: 1.6, launch: 14 },
    { id: "moon-geyser", pos: [4, 0, 0], radius: 1.6, launch: 14 },
  ],
  herbs: [
    { id: "sun-herb", pos: [-22, 0, 3] },
    { id: "moon-herb", pos: [22, 0, 3] },
  ],
  herbSpawns: [[-22, 0, 3], [22, 0, 3]],
  creatureSpawns: [[26, 0, 0], [20, 0, -11], [20, 0, 11], [7, 0.3, 23], [29, 0, -6], [11, 0, -11]],
  breakables: [],
  decor: [], notes: [{ text: "rope bridges", pos: [0,10,4] }, { text: "hollow tree", pos: [-7,9,8] }], look: { sunShafts: true, stainSeed: 6101 }, landmark: [0, 16, 0] };
