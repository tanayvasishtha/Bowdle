import { jungleDressing } from "./dressing.ts";
import { mirrorX } from "./helpers.ts";
import { rect } from "./scatter.ts";
import type { Box, MapData, Prop, Ramp, SpawnPoint, Vec3Tuple, Volume, Waypoint } from "./types.ts";

/** Village Defense map ~160 x 160 m. Totem village, walls, towers, jungle rim. */
const boxes: Box[] = [
  { id: "floor", min: [-78, -1, -78], max: [78, 0, 78], material: "earth", tags: ["solid"] },
  { id: "boundary-west", min: [-80, 0, -80], max: [-78, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-east", min: [78, 0, -80], max: [80, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-south", min: [-80, 0, -80], max: [80, 12, -78], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-north", min: [-80, 0, 78], max: [80, 12, 80], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "ceiling", min: [-80, 14, -80], max: [80, 16, 80], material: "canopy", tags: ["solid", "invisible"] },
  // Totem plinth (self-symmetric).
  { id: "totem-base", min: [-1.8, 0, -1.8], max: [1.8, 0.4, 1.8], material: "carvedStone", tags: ["solid", "grapple"] },
  { id: "totem-pillar", min: [-0.7, 0.4, -0.7], max: [0.7, 3.6, 0.7], material: "carvedStone", tags: ["solid", "grapple"] },
];

function addPair(box: Box): void {
  boxes.push(box, mirrorX(box, box.id.replace("sun", "moon")));
}

addPair({ id: "sun-brazier-pad", min: [-5.1, 0, 7.4], max: [-3.9, 0.05, 8.6], material: "stone", tags: ["solid"] });
addPair({ id: "sun-brazier-col", min: [-5.0, 0, 7.5], max: [-4.0, 2.0, 8.5], material: "stone", tags: ["solid", "invisible"] });

// Village ring walls with cardinal gaps for raider paths.
const wallY = 2.4;
for (const [id, min, max] of [
  ["wall-n-w", [-22, 0, 20], [-6, wallY, 22]] as const,
  ["wall-n-e", [6, 0, 20], [22, wallY, 22]] as const,
  ["wall-s-w", [-22, 0, -22], [-6, wallY, -20]] as const,
  ["wall-s-e", [6, 0, -22], [22, wallY, -20]] as const,
  ["wall-w-n", [-22, 0, 6], [-20, wallY, 20]] as const,
  ["wall-w-s", [-22, 0, -20], [-20, wallY, -6]] as const,
  ["wall-e-n", [20, 0, 6], [22, wallY, 20]] as const,
  ["wall-e-s", [20, 0, -20], [22, wallY, -6]] as const,
]) {
  boxes.push({ id, min: [...min], max: [...max], material: "wood", tags: ["solid"] });
}

// Watchtowers (sun NW / SW mirrored to moon).
addPair({ id: "sun-tower-n", min: [-25.4, 0, 25.4], max: [-24.2, 6.2, 26.6], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-tower-n-deck", min: [-27, 6.2, 24], max: [-23, 6.5, 28], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-tower-s", min: [-25.4, 0, -26.6], max: [-24.2, 6.2, -25.4], material: "wood", tags: ["solid", "grapple"] });
addPair({ id: "sun-tower-s-deck", min: [-27, 6.2, -28], max: [-23, 6.5, -24], material: "wood", tags: ["solid", "grapple"] });


// Low cover inside the village.
for (const [x, z] of [[-48, 12], [-48, -12]] as const) {
  addPair({ id: `sun-crate-${x}-${z}`, min: [x - 1, 0, z - 1], max: [x + 1, 1.1, z + 1], material: "wood", tags: ["solid"] });
}

// Midfield LOS screens outside the yard, on spawn latitudes.
// Narrow eye-height screens on spawn latitudes; totem apron at z≈-3.5 stays clear.
for (const z of [-16, -6, 6, 16]) {
  boxes.push({
    id: `los-post-${z}`,
    min: [-1.5, 0, z - 0.8],
    max: [1.5, 3.4, z + 0.8],
    material: "carvedStone",
    tags: ["solid"],
  });
}

const ramps: Ramp[] = [];
function addRampPair(ramp: Ramp): void { ramps.push(ramp, mirrorX(ramp, ramp.id.replace("sun", "moon"))); }
// Tower ramps rise 6.5 over ~12 m (~28 deg), ending on the deck.
addRampPair({ id: "sun-tower-n-ramp", min: [-38, 0, 25], max: [-27, 6.5, 27], up: "+x", material: "wood", tags: ["solid"] });
addRampPair({ id: "sun-tower-s-ramp", min: [-38, 0, -27], max: [-27, 6.5, -25], up: "+x", material: "wood", tags: ["solid"] });

const sunGrassN: Volume = { id: "sun-grass-n", min: [-70, 0, 40], max: [-30, 1.2, 68], kind: "tallGrass" };
const sunGrassS: Volume = { id: "sun-grass-s", min: [-70, 0, -68], max: [-30, 1.2, -40], kind: "tallGrass" };
const sunGrassW: Volume = { id: "sun-grass-w", min: [-70, 0, -20], max: [-40, 1.2, 20], kind: "tallGrass" };
const volumes: Volume[] = [
  sunGrassN, mirrorX(sunGrassN, "moon-grass-n"),
  sunGrassS, mirrorX(sunGrassS, "moon-grass-s"),
  sunGrassW, mirrorX(sunGrassW, "moon-grass-w"),
];

const props: Prop[] = [
  { kind: "stoneHead", pos: [0, 0.4, 0], yaw: 0, scale: 1.1, seed: 5101 },
  { kind: "lantern", pos: [0, 3.6, 0], yaw: 0, scale: 0.9, seed: 5103 },
];
{
  const brazier: Prop = { kind: "brazier", pos: [-4.5, 0, 8], yaw: 0, scale: 1, seed: 5102 };
  props.push(brazier, mirrorX(brazier));
}

function solidProp(prop: Prop, halfWidth: number, height: number, id: string): void {
  const [x, y, z] = prop.pos;
  const box: Box = {
    id,
    min: [x - halfWidth, y, z - halfWidth],
    max: [x + halfWidth, y + height, z + halfWidth],
    material: "canvas",
    tags: ["solid", "invisible"],
  };
  props.push(prop, mirrorX(prop));
  boxes.push(box, mirrorX(box, id.replace("sun", "moon")));
}

// Huts around the totem (mirrored).
for (const [x, z, yaw] of [[-16, 16, 0.3], [-18, -14, -0.4], [-14, -18, 0.8]] as const) {
  solidProp({ kind: "tent", pos: [x, 0, z], yaw, scale: 1.05, seed: 5200 + Math.round(z) }, 1.5, 2.3, `sun-hut-${z}`);
}
for (const [x, z] of [[-26, 26], [-26, -26]] as const) {
  const torch: Prop = { kind: "torch", pos: [x, 6.5, z], yaw: 0, scale: 0.8, seed: 5300 + z };
  props.push(torch, mirrorX(torch));
}
for (const [x, z] of [[-50, 0], [-35, 50], [-35, -50]] as const) {
  const log: Prop = { kind: "fallenLog", pos: [x, 0, z], yaw: 0.5, scale: 1.1, seed: 5400 + z };
  props.push(log, mirrorX(log));
}

// Player spawns near west/east rim (defense staging), mirrored.
const sunSpawns: SpawnPoint[] = [-16, -6, 6, 16].map((z) => ({ pos: [-36, 0, z] as Vec3Tuple, yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({
  pos: [-spawn.pos[0], spawn.pos[1], spawn.pos[2]] as Vec3Tuple,
  yaw: Math.PI / 2,
}));

// Herbs sit in the village yards around the totem, never on the plinth itself.
const herbSpawns: Vec3Tuple[] = [
  [-8, 0, 6],
  [8, 0, 6],
  [-8, 0, -6],
  [8, 0, -6],
];

const creatureSpawns: Vec3Tuple[] = [
  [0, 0, 70],
  [70, 0, 0],
  [0, 0, -70],
  [-70, 0, 0],
  [55, 0, 55],
  [-55, 0, 55],
  [55, 0, -55],
  [-55, 0, -55],
];

const dressing = jungleDressing({
  idPrefix: "grove",
  seed: 9101,
  bounds: rect(-76, -76, 76, 76),
  blockers: {
    boxes,
    ramps,
    volumes,
    spawns: [...sunSpawns, ...moonSpawns],
    extra: [rect(-24, -24, 24, 24)],
  },
  patchMaterials: ["fern", "canopy", "earth"],
  grassVolumes: volumes,
  scatterCount: 160,
  treeSpacing: 4.5,
  patchCount: 16,
});
props.push(...dressing.props);
boxes.push(...dressing.patches);

type LinkKind = "walk" | "jump" | "drop" | "grapple";
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

const places: Array<[string, number, number, number]> = [
  ["sun-hub", -36, 0, 0], ["moon-hub", 36, 0, 0],
  ["sun-rim-s", -55, 0, -55], ["sun-rim-n", -55, 0, 55], ["moon-rim-s", 55, 0, -55], ["moon-rim-n", 55, 0, 55],
  ["entry-n", 0, 0, 70], ["entry-e", 70, 0, 0], ["entry-s", 0, 0, -70], ["entry-w", -70, 0, 0],
  ["gate-n", 0, 0, 24], ["gate-s", 0, 0, -24], ["gate-w", -24, 0, 0], ["gate-e", 24, 0, 0],
  // Yard corners clear of LOS posts at z=±6/±16 and huts.
  ["yard-nw", -10, 0, 10], ["yard-ne", 10, 0, 10], ["yard-sw", -10, 0, -10], ["yard-se", 10, 0, -10],
  ["totem", 0, 0, -3.5],
  ["path-nw", -40, 0, 40], ["path-ne", 40, 0, 40], ["path-sw", -40, 0, -40], ["path-se", 40, 0, -40],
  ["sun-tower-n", -27, 6.5, 26], ["sun-tower-s", -27, 6.5, -26], ["moon-tower-n", 27, 6.5, 26], ["moon-tower-s", 27, 6.5, -26],
  ["sun-tower-n-low", -38, 0, 26], ["sun-tower-s-low", -38, 0, -26], ["moon-tower-n-low", 38, 0, 26], ["moon-tower-s-low", 38, 0, -26],
];
for (const [id, x, y, z] of places) node(id, [x, y, z]);

for (let i = 0; i < 4; i += 1) {
  connect(`sun-spawn-${i}`, "sun-hub");
  connect(`moon-spawn-${i}`, "moon-hub");
}
for (const chain of [
  ["entry-w", "sun-hub", "gate-w"],
  ["entry-e", "moon-hub", "gate-e"],
  ["entry-n", "gate-n"],
  ["entry-s", "gate-s"],
  ["gate-n", "yard-nw", "gate-w"],
  ["gate-n", "yard-ne", "gate-e"],
  ["gate-s", "yard-sw", "gate-w"],
  ["gate-s", "yard-se", "gate-e"],
  ["yard-sw", "totem"], ["yard-se", "totem"],
  ["yard-nw", "totem"], ["yard-ne", "totem"],
  ["yard-sw", "gate-s"], ["yard-se", "gate-s"],
  ["sun-hub", "path-nw", "entry-n"],
  ["sun-hub", "path-sw", "entry-s"],
  ["moon-hub", "path-ne", "entry-n"],
  ["moon-hub", "path-se", "entry-s"],
  ["path-nw", "sun-rim-n"], ["path-ne", "moon-rim-n"],
  ["path-sw", "sun-rim-s"], ["path-se", "moon-rim-s"],
  ["entry-w", "sun-rim-n"], ["entry-w", "sun-rim-s"],
  ["entry-e", "moon-rim-n"], ["entry-e", "moon-rim-s"],
  ["sun-hub", "sun-tower-n-low", "sun-tower-n"],
  ["sun-hub", "sun-tower-s-low", "sun-tower-s"],
  ["moon-hub", "moon-tower-n-low", "moon-tower-n"],
  ["moon-hub", "moon-tower-s-low", "moon-tower-s"],
]) {
  for (let i = 1; i < chain.length; i += 1) connect(chain[i - 1]!, chain[i]!);
}
connect("sun-tower-n", "totem", "grapple");
connect("moon-tower-n", "totem", "grapple");

const waypoints: Waypoint[] = nodes.map((entry) => ({ ...entry, links: links.get(entry.id) ?? [] }));

export const homeGroveMap: MapData = {
  id: "home-grove",
  name: "Home Grove",
  bounds: { min: [-80, -2, -80], max: [80, 16, 80] },
  boxes,
  ramps,
  volumes,
  zipLines: [],
  boulders: [],
  props,
  spawns: { sun: sunSpawns, moon: moonSpawns },
  waypoints,
  decor: [],
  notes: [
    { text: "totem", pos: [0, 4, 0] },
    { text: "watchtower", pos: [-26, 8, 26] },
  ],
  look: { sunShafts: false, stainSeed: 9101 },
  landmark: [0, 4.5, 0],
  creatureSpawns,
  herbSpawns,
  totem: [0, 0, 0],
  relic: [0, 0.4, -3.5],
  camps: {
    sun: { min: [-42, -1.5, -22], max: [-30, 4, 22] },
    moon: { min: [30, -1.5, -22], max: [42, 4, 22] },
  },
};
