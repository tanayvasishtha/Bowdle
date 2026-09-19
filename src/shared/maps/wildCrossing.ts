import { jungleDressing } from "./dressing.ts";
import { mirrorX } from "./helpers.ts";
import { rect } from "./scatter.ts";
import type { Box, MapData, Prop, Ramp, SpawnPoint, Vec3Tuple, Volume, Waypoint, ZipLine } from "./types.ts";

/** Lobby arena ~200 x 160 m. Ruined temple, river, cliffs, meadows, zips. */
const boxes: Box[] = [
  { id: "floor", min: [-98, -1, -78], max: [98, 0, 78], material: "earth", tags: ["solid"] },
  { id: "river-bed", min: [-90, -0.5, -10], max: [90, -0.15, 10], material: "stone", tags: ["solid"] },
  { id: "boundary-west", min: [-100, 0, -80], max: [-98, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-east", min: [98, 0, -80], max: [100, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-south", min: [-100, 0, -80], max: [100, 12, -78], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-north", min: [-100, 0, 78], max: [100, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "ceiling", min: [-100, 16, -80], max: [100, 18, 80], material: "canopy", tags: ["solid", "invisible"] },
  // Center temple tiers (self-symmetric strips with a walk gap on the midline).
  { id: "tier1-sw", min: [-12, 0, -12], max: [-1.6, 1.2, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier1-se", min: [1.6, 0, -12], max: [12, 1.2, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier1-nw", min: [-12, 0, 1.6], max: [-1.6, 1.2, 12], material: "carvedStone", tags: ["solid"] },
  { id: "tier1-ne", min: [1.6, 0, 1.6], max: [12, 1.2, 12], material: "carvedStone", tags: ["solid"] },
  { id: "tier2-sw", min: [-9, 1.2, -9], max: [-1.6, 2.4, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier2-se", min: [1.6, 1.2, -9], max: [9, 2.4, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier2-nw", min: [-9, 1.2, 1.6], max: [-1.6, 2.4, 9], material: "carvedStone", tags: ["solid"] },
  { id: "tier2-ne", min: [1.6, 1.2, 1.6], max: [9, 2.4, 9], material: "carvedStone", tags: ["solid"] },
  { id: "tier3-sw", min: [-6, 2.4, -6], max: [-1.6, 3.6, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier3-se", min: [1.6, 2.4, -6], max: [6, 3.6, -1.6], material: "carvedStone", tags: ["solid"] },
  { id: "tier3-nw", min: [-6, 2.4, 1.6], max: [-1.6, 3.6, 6], material: "carvedStone", tags: ["solid"] },
  { id: "tier3-ne", min: [1.6, 2.4, 1.6], max: [6, 3.6, 6], material: "carvedStone", tags: ["solid"] },
  { id: "altar", min: [-2.5, 3.6, -2.5], max: [2.5, 4.8, 2.5], material: "carvedStone", tags: ["solid", "grapple"] },
];

function addPair(box: Box): void {
  boxes.push(box, mirrorX(box, box.id.replace("sun", "moon")));
}

// River bridges (self-symmetric center + mirrored side bridges).
boxes.push(
  { id: "bridge-center", min: [-4, 0, -12], max: [4, 0.3, 12], material: "wood", tags: ["solid", "grapple"] },
);
addPair({ id: "sun-bridge-mid", min: [-54, 0, -12], max: [-46, 0.3, 12], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-bridge-far", min: [-74, 0, -12], max: [-66, 0.3, 12], material: "wood", tags: ["solid", "grapple"] });

// Spine ruins that block east-west spawn LOS. Skip z=0 so temple stairs stay clear;
// a low temple screen blocks the mid spawn LOS under the altar.
for (const [id, z0, z1] of [
  ["spine-far-s", -70, -58],
  ["spine-mid-s", -50, -24],
  ["spine-mid-n", 24, 50],
  ["spine-far-n", 58, 70],
] as const) {
  boxes.push({
    id,
    min: [-2.2, 0, z0],
    max: [2.2, 5.5, z1],
    material: "carvedStone",
    tags: ["solid"],
  });
}
boxes.push({
  id: "temple-screen",
  min: [-1.6, 0, -1.4],
  max: [1.6, 3.4, 1.4],
  material: "carvedStone",
  tags: ["solid"],
});
boxes.push({
  id: "los-diagonal-s",
  min: [-1.6, 0, -18],
  max: [1.6, 3.6, -14],
  material: "carvedStone",
  tags: ["solid"],
});
boxes.push({
  id: "los-diagonal-n",
  min: [-1.6, 0, 14],
  max: [1.6, 3.6, 18],
  material: "carvedStone",
  tags: ["solid"],
});

// Meadow low cover and ruin pockets (sun half, mirrored).
for (const [x, z] of [[-62, -38], [-42, 36], [-35, -58], [-30, 58]] as const) {
  addPair({ id: `sun-ruin-${x}-${z}`, min: [x - 1.6, 0, z - 1], max: [x + 1.6, 1.4, z + 1], material: "stone", tags: ["solid"] });
}

// Cliff platforms for height (sun NW / SW), stairs up, mirrored.
addPair({ id: "sun-cliff-north", min: [-66, 4.8, 50], max: [-60, 5.1, 58], material: "stone", tags: ["solid", "grapple"] });
addPair({ id: "sun-cliff-south", min: [-66, 4.8, -58], max: [-60, 5.1, -50], material: "stone", tags: ["solid", "grapple"] });

// Temple stairs north and south (self-symmetric width about x=0).

// Grapple vines on temple faces.
addPair({ id: "sun-vine", min: [-12.08, 0.4, 8], max: [-11.92, 4.2, 14], material: "gold", tags: ["solid", "grapple"] });

// Pillar colonnade near meadows.
for (const z of [-36, -12, 12, 36]) {
  addPair({ id: `sun-pillar-${z}`, min: [-44.5, 0, z - 0.55], max: [-43.45, 3.2, z + 0.55], material: "carvedStone", tags: ["solid", "grapple"] });
}

const ramps: Ramp[] = [];
function addRampPair(ramp: Ramp): void { ramps.push(ramp, mirrorX(ramp, ramp.id.replace("sun", "moon"))); }
// Cliff ramps: rise 5.1 over 12 m run (~23 deg).
addRampPair({ id: "sun-cliff-n-ramp", min: [-78, 0, 50], max: [-66, 5.1, 56], up: "+x", material: "stone", tags: ["solid"] });
addRampPair({ id: "sun-cliff-s-ramp", min: [-78, 0, -56], max: [-66, 5.1, -50], up: "+x", material: "stone", tags: ["solid"] });

const sunWater: Volume = { id: "sun-river", min: [-90, -0.15, -10], max: [-4, 0.35, 10], kind: "water" };
const moonWater = mirrorX(sunWater, "moon-river");
const centerWater: Volume = { id: "center-river", min: [-4, -0.15, -10], max: [4, 0.35, 10], kind: "water" };
const sunGrassN: Volume = { id: "sun-grass-n", min: [-88, 0, 20], max: [-56, 1.2, 42], kind: "tallGrass" };
const sunGrassS: Volume = { id: "sun-grass-s", min: [-88, 0, -42], max: [-56, 1.2, -20], kind: "tallGrass" };
const volumes: Volume[] = [
  sunWater, moonWater, centerWater,
  sunGrassN, mirrorX(sunGrassN, "moon-grass-n"),
  sunGrassS, mirrorX(sunGrassS, "moon-grass-s"),
];

const sunZipN: ZipLine = { id: "sun-zip-n", from: [-66, 5.1, 53], to: [-40, 0.3, 28] };
const sunZipS: ZipLine = { id: "sun-zip-s", from: [-66, 5.1, -53], to: [-40, 0.3, -28] };
const zipLines: ZipLine[] = [
  sunZipN, mirrorX(sunZipN, "moon-zip-n"),
  sunZipS, mirrorX(sunZipS, "moon-zip-s"),
];

const props: Prop[] = [
  { kind: "sunDisc", pos: [0, 4.8, 0], yaw: 0, scale: 1.1, seed: 3101 },
  { kind: "ropeBridge", pos: [0, 0.35, 0], yaw: Math.PI / 2, scale: 3.2, seed: 3102 },
  { kind: "ropeBridge", pos: [0, 0.35, 0], yaw: -Math.PI / 2, scale: 3.2, seed: 3102 },
  { kind: "waterSurface", pos: [0, 0.36, 0], yaw: 0, scale: 8, seed: 3103 },
  { kind: "mist", pos: [0, 0.2, 0], yaw: 0, scale: 3, seed: 3104 },
];

function solidProp(prop: Prop, halfWidth: number, height: number, id: string): void {
  const [x, y, z] = prop.pos;
  const box: Box = {
    id,
    min: [x - halfWidth, y, z - halfWidth],
    max: [x + halfWidth, y + height, z + halfWidth],
    material: "wood",
    tags: ["solid", "invisible"],
  };
  props.push(prop, mirrorX(prop));
  boxes.push(box, mirrorX(box, id.replace("sun", "moon")));
}

for (const [x, z] of [[-88, -40], [-88, 40]] as const) {
  solidProp({ kind: "tent", pos: [x, 0, z], yaw: 0.2, scale: 1, seed: 3200 + z }, 1.4, 2.2, `sun-tent-${z}`);
}
for (const zip of [sunZipN, sunZipS]) {
  const rope: Prop = {
    kind: "zipRope",
    pos: [(zip.from[0] + zip.to[0]) / 2, (zip.from[1] + zip.to[1]) / 2, (zip.from[2] + zip.to[2]) / 2],
    yaw: 0.7,
    scale: 2.8,
    seed: 3300 + zip.from[2],
  };
  props.push(rope, mirrorX(rope));
}
for (const z of [-36, 12, 36]) {
  const pillar: Prop = { kind: "pillar", pos: [-44, 0, z], yaw: 0, scale: 0.75, seed: 3400 + z };
  props.push(pillar, mirrorX(pillar));
}
for (const z of [-8, 8]) {
  solidProp({ kind: "stoneHead", pos: [-10, 1.2, z], yaw: z < 0 ? Math.PI : 0, scale: 0.85, seed: 3500 + z }, 0.6, 1.8, `sun-head-${z}`);
}

const sunZs = [-64, -32, 0, 32, 64] as const;
const sunSpawns: SpawnPoint[] = sunZs.map((z) => ({ pos: [-90, 0, z], yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({
  pos: [-spawn.pos[0], spawn.pos[1], spawn.pos[2]] as Vec3Tuple,
  yaw: Math.PI / 2,
}));

const dressing = jungleDressing({
  idPrefix: "wild",
  seed: 8801,
  bounds: rect(-96, -76, 96, 76),
  blockers: {
    boxes,
    ramps,
    volumes,
    zipLines,
    spawns: [...sunSpawns, ...moonSpawns],
    extra: [rect(-14, -14, 14, 14), rect(-92, -12, 92, 12)],
  },
  patchMaterials: ["fern", "canopy", "stone"],
  grassVolumes: volumes,
  scatterCount: 180,
  treeSpacing: 5,
  patchCount: 18,
});
props.push(...dressing.props);
boxes.push(...dressing.patches);

type LinkKind = "walk" | "jump" | "drop" | "zip" | "grapple";
const nodes: Array<{ id: string; pos: Vec3Tuple }> = [];
const links = new Map<string, Array<{ to: string; kind: LinkKind }>>();
function node(id: string, pos: Vec3Tuple): void { nodes.push({ id, pos }); }
function connect(a: string, b: string, kind: LinkKind = "walk", reverse = true): void {
  const left = links.get(a) ?? [];
  left.push({ to: b, kind });
  links.set(a, left);
  if (reverse) {
    const right = links.get(b) ?? [];
    right.push({ to: a, kind });
    links.set(b, right);
  }
}

for (let i = 0; i < sunSpawns.length; i += 1) {
  node(`sun-spawn-${i}`, sunSpawns[i]!.pos);
  node(`moon-spawn-${i}`, moonSpawns[i]!.pos);
}

const ring: Array<[string, number, number, number]> = [
  ["sun-rim-s", -90, 0, -64], ["sun-rim-ms", -90, 0, -32], ["sun-rim-m", -90, 0, 0], ["sun-rim-mn", -90, 0, 32], ["sun-rim-n", -90, 0, 64],
  ["moon-rim-s", 90, 0, -64], ["moon-rim-ms", 90, 0, -32], ["moon-rim-m", 90, 0, 0], ["moon-rim-mn", 90, 0, 32], ["moon-rim-n", 90, 0, 64],
  ["sun-mid-s", -55, 0, -55], ["sun-mid-ms", -55, 0, -25], ["sun-mid-m", -55, 0, 0], ["sun-mid-mn", -55, 0, 25], ["sun-mid-n", -55, 0, 55],
  ["moon-mid-s", 55, 0, -55], ["moon-mid-ms", 55, 0, -25], ["moon-mid-m", 55, 0, 0], ["moon-mid-mn", 55, 0, 25], ["moon-mid-n", 55, 0, 55],
  ["sun-near-s", -28, 0, -55], ["sun-near-n", -28, 0, 55], ["moon-near-s", 28, 0, -55], ["moon-near-n", 28, 0, 55],
  ["cross-s", 0, 0, -55], ["cross-n", 0, 0, 55],
  ["bank-s--70", -70, 0, -20], ["bank-s--50", -50, 0, -20], ["bank-s-0", 0, 0, -20], ["bank-s-50", 50, 0, -20], ["bank-s-70", 70, 0, -20],
  ["bank-n--70", -70, 0, 20], ["bank-n--50", -50, 0, 20], ["bank-n-0", 0, 0, 20], ["bank-n-50", 50, 0, 20], ["bank-n-70", 70, 0, 20],
  ["bridge--70", -70, 0.3, 0], ["bridge--50", -50, 0.3, 0], ["bridge-50", 50, 0.3, 0], ["bridge-70", 70, 0.3, 0],
  ["sun-cliff-n", -66, 5.1, 53], ["sun-cliff-s", -66, 5.1, -53], ["moon-cliff-n", 66, 5.1, 53], ["moon-cliff-s", 66, 5.1, -53],
  ["sun-cliff-n-low", -78, 0, 53], ["sun-cliff-s-low", -78, 0, -53], ["moon-cliff-n-low", 78, 0, 53], ["moon-cliff-s-low", 78, 0, -53],
  ["sun-cliff-n-approach", -82, 0, 45], ["sun-cliff-s-approach", -82, 0, -45],
  ["moon-cliff-n-approach", 82, 0, 45], ["moon-cliff-s-approach", 82, 0, -45],
  ["zip-sun-n-low", -40, 0.3, 28], ["zip-sun-s-low", -40, 0.3, -28], ["zip-moon-n-low", 40, 0.3, 28], ["zip-moon-s-low", 40, 0.3, -28],
  ["altar-s-foot", 0, 0, -20], ["altar-n-foot", 0, 0, 20], ["altar", 0, 4.8, 0],
];
for (const [id, x, y, z] of ring) node(id, [x, y, z]);

const rimSun = ["sun-rim-s", "sun-rim-ms", "sun-rim-m", "sun-rim-mn", "sun-rim-n"];
const rimMoon = ["moon-rim-s", "moon-rim-ms", "moon-rim-m", "moon-rim-mn", "moon-rim-n"];
for (let i = 0; i < 5; i += 1) {
  connect(`sun-spawn-${i}`, rimSun[i]!);
  connect(`moon-spawn-${i}`, rimMoon[i]!);
}
for (let i = 1; i < rimSun.length; i += 1) {
  connect(rimSun[i - 1]!, rimSun[i]!);
  connect(rimMoon[i - 1]!, rimMoon[i]!);
}
for (const chain of [
  ["sun-rim-s", "sun-mid-s", "sun-near-s", "cross-s", "moon-near-s", "moon-mid-s", "moon-rim-s"],
  ["sun-rim-n", "sun-mid-n", "sun-near-n", "cross-n", "moon-near-n", "moon-mid-n", "moon-rim-n"],
  ["sun-rim-ms", "sun-mid-ms", "bank-s--50", "bank-s-0", "bank-s-50", "moon-mid-ms", "moon-rim-ms"],
  ["sun-rim-mn", "sun-mid-mn", "bank-n--50", "bank-n-0", "bank-n-50", "moon-mid-mn", "moon-rim-mn"],
  ["sun-rim-m", "sun-mid-m", "bridge--70", "bridge--50", "bank-s--50", "bank-s-0", "bank-s-50", "bridge-50", "bridge-70", "moon-mid-m", "moon-rim-m"],
  ["sun-mid-s", "sun-mid-ms", "sun-mid-m", "sun-mid-mn", "sun-mid-n"],
  ["moon-mid-s", "moon-mid-ms", "moon-mid-m", "moon-mid-mn", "moon-mid-n"],
  ["bank-s--70", "bank-s--50", "bank-s-0", "bank-s-50", "bank-s-70"],
  ["bank-n--70", "bank-n--50", "bank-n-0", "bank-n-50", "bank-n-70"],
  ["bridge--70", "bank-s--70", "bank-n--70", "bridge--50"],
  ["bridge-70", "bank-s-70", "bank-n-70", "bridge-50"],
  ["cross-s", "sun-near-s"],
  ["cross-n", "sun-near-n"],
  ["sun-near-s", "sun-mid-s", "sun-mid-ms", "bank-s--50", "bank-s-0", "altar-s-foot"],
  ["moon-near-s", "moon-mid-s", "moon-mid-ms", "bank-s-50", "bank-s-0"],
  ["sun-near-n", "sun-mid-n", "sun-mid-mn", "bank-n--50", "bank-n-0", "altar-n-foot"],
  ["moon-near-n", "moon-mid-n", "moon-mid-mn", "bank-n-50", "bank-n-0"],
  ["sun-mid-n", "sun-cliff-n-approach", "sun-cliff-n-low", "sun-cliff-n"],
  ["sun-mid-s", "sun-cliff-s-approach", "sun-cliff-s-low", "sun-cliff-s"],
  ["moon-mid-n", "moon-cliff-n-approach", "moon-cliff-n-low", "moon-cliff-n"],
  ["moon-mid-s", "moon-cliff-s-approach", "moon-cliff-s-low", "moon-cliff-s"],
]) {
  for (let i = 1; i < chain.length; i += 1) connect(chain[i - 1]!, chain[i]!);
}
connect("sun-cliff-n", "zip-sun-n-low", "zip", false);
connect("sun-cliff-s", "zip-sun-s-low", "zip", false);
connect("moon-cliff-n", "zip-moon-n-low", "zip", false);
connect("moon-cliff-s", "zip-moon-s-low", "zip", false);
connect("zip-sun-n-low", "sun-mid-mn");
connect("zip-sun-s-low", "sun-mid-ms");
connect("zip-moon-n-low", "moon-mid-mn");
connect("zip-moon-s-low", "moon-mid-ms");
connect("sun-cliff-n", "altar", "grapple");
connect("moon-cliff-n", "altar", "grapple");
connect("altar-s-foot", "altar", "jump");
connect("altar-n-foot", "altar", "jump");


const waypoints: Waypoint[] = nodes.map((entry) => ({ ...entry, links: links.get(entry.id) ?? [] }));

export const wildCrossingMap: MapData = {
  id: "wild-crossing",
  name: "Wild Crossing",
  bounds: { min: [-100, -2, -80], max: [100, 18, 80] },
  boxes,
  ramps,
  volumes,
  zipLines,
  boulders: [],
  props,
  spawns: { sun: sunSpawns, moon: moonSpawns },
  waypoints,
  decor: [],
  notes: [
    { text: "temple", pos: [0, 6.5, 0] },
    { text: "river", pos: [0, 1, 0] },
  ],
  look: { sunShafts: true, stainSeed: 8801 },
  landmark: [0, 6.6, 0],
  relic: [0, 4.8, 0],
  camps: {
    sun: { min: [-96, -1.5, -70], max: [-82, 4, 70] },
    moon: { min: [82, -1.5, -70], max: [96, 4, 70] },
  },
};
