import { jungleDressing } from "./dressing.ts";
import { mirrorX, stairs } from "./helpers.ts";
import { rect } from "./scatter.ts";
import type { Boulder, Box, MapData, Prop, Ramp, SpawnPoint, Vec3Tuple, Volume, Waypoint } from "./types.ts";

const boxes: Box[] = [
  { id: "floor-deep-south", min: [-36, -1, -28], max: [36, 0, -18], material: "earth", tags: ["solid"] },
  { id: "floor-south-inner", min: [-36, -1, -12], max: [36, 0, -1.8], material: "earth", tags: ["solid"] },
  { id: "floor-pool-band-west", min: [-36, -1, -18], max: [-18, 0, -12], material: "earth", tags: ["solid"] },
  { id: "floor-pool-band-center", min: [-10, -1, -18], max: [10, 0, -12], material: "earth", tags: ["solid"] },
  { id: "floor-pool-band-east", min: [18, -1, -18], max: [36, 0, -12], material: "earth", tags: ["solid"] },
  { id: "sun-pool-bed", min: [-18, -0.6, -18], max: [-10, -0.4, -12], material: "stone", tags: ["solid"] },
  { id: "moon-pool-bed", min: [10, -0.6, -18], max: [18, -0.4, -12], material: "stone", tags: ["solid"] },
  { id: "floor-north", min: [-36, -1, 1.8], max: [36, 0, 20], material: "earth", tags: ["solid"] },
  { id: "floor-far-north", min: [-36, -1, 26], max: [36, 0, 28], material: "earth", tags: ["solid"] },
  { id: "ravine-floor", min: [-36, -4.2, 20], max: [36, -4, 26], material: "stone", tags: ["solid"] },
  { id: "tunnel-west-ground", min: [-36, -1, -1.8], max: [-18, 0, 1.8], material: "earth", tags: ["solid"] },
  { id: "tunnel-east-ground", min: [18, -1, -1.8], max: [36, 0, 1.8], material: "earth", tags: ["solid"] },
  { id: "tunnel-floor", min: [-11, -2.6, -1.8], max: [11, -2.4, 1.8], material: "stone", tags: ["solid"] },
  { id: "bridge", min: [-8, 0, 21.5], max: [8, 0.25, 24.5], material: "wood", tags: ["solid", "grapple"] },
  { id: "altar", min: [-2.5, 3.6, -2.5], max: [2.5, 4.8, 2.5], material: "carvedStone", tags: ["solid", "grapple"] },
  { id: "tunnel-screen", min: [-1, 1, -2], max: [1, 3, 2], material: "carvedStone", tags: ["solid"] },
  { id: "boundary-west", min: [-36, 0, -28], max: [-34, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-east", min: [34, 0, -28], max: [36, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-south", min: [-36, 0, -28], max: [36, 10, -26], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "boundary-north", min: [-36, 0, 26], max: [36, 10, 28], material: "foliageDark", tags: ["solid", "invisible"] },
  { id: "ceiling", min: [-36, 16, -28], max: [36, 17, 28], material: "canopy", tags: ["solid", "invisible"] },
];

for (const tier of [
  { id: "tier1", extent: 10, minY: 0, maxY: 1.2 },
  { id: "tier2", extent: 7.5, minY: 1.2, maxY: 2.4 },
  { id: "tier3", extent: 5, minY: 2.4, maxY: 3.6 },
]) for (const side of [-1, 1]) for (const lane of [-1, 1]) {
  const minX = side < 0 ? -tier.extent : 1.5, maxX = side < 0 ? -1.5 : tier.extent;
  const minZ = lane < 0 ? -tier.extent : 1.8, maxZ = lane < 0 ? -1.8 : tier.extent;
  boxes.push({ id: `${tier.id}-${side}-${lane}`, min: [minX, tier.minY, minZ], max: [maxX, tier.maxY, maxZ], material: "carvedStone", tags: ["solid"] });
}

boxes.push(...stairs({ idPrefix: "altar-south", start: [-1.5, 0, -10], dir: "+z", steps: 12, rise: 0.4, run: 0.6, width: 3, material: "stone" }));
boxes.push(...stairs({ idPrefix: "altar-north", start: [-1.5, 0, 10], dir: "-z", steps: 12, rise: 0.4, run: 0.6, width: 3, material: "stone" }));

const sunPillars: Box[] = [];
for (let x = -26; x <= -6; x += 4) for (const z of [13, 17]) sunPillars.push({ id: `sun-pillar-${x}-${z}`, min: [x - 0.55, 0, z - 0.55], max: [x + 0.55, 2.4 + (Math.abs(x) % 3) * 0.4, z + 0.55], material: "carvedStone", tags: ["solid", "grapple"] });
for (const box of sunPillars) boxes.push(box, mirrorX(box, box.id.replace("sun", "moon")));
const sunWall: Box = { id: "sun-courtyard-wall", min: [-25, 0, -21], max: [-20, 1.1, -20.3], material: "stone", tags: ["solid"] }; boxes.push(sunWall, mirrorX(sunWall, "moon-courtyard-wall"));
const sunVine: Box = { id: "sun-vine", min: [-10.08, 0.4, 4], max: [-9.92, 3.4, 7], material: "gold", tags: ["solid", "grapple"] }; boxes.push(sunVine, mirrorX(sunVine, "moon-vine"));

const sunRamp: Ramp = { id: "sun-tunnel-ramp", min: [-18, -2.4, -1.6], max: [-11, 0, 1.6], up: "-x", material: "earth", tags: ["solid"] };
const ramps: Ramp[] = [sunRamp, mirrorX(sunRamp, "moon-tunnel-ramp")];
const sunWater: Volume = { id: "sun-pool", min: [-18, -0.4, -18], max: [-10, 0, -12], kind: "water" };
const sunGrass: Volume = { id: "sun-grass", min: [-26, 0, -16], max: [-20, 1.2, -8], kind: "tallGrass" };
const volumes: Volume[] = [sunWater, mirrorX(sunWater, "moon-pool"), sunGrass, mirrorX(sunGrass, "moon-grass")];
const boulder: Boulder = { id: "temple-boulder", path: [[-18, 1.5, 0], [-11, -0.9, 0], [11, -0.9, 0], [18, 1.5, 0]], lever: [0, 4.8, 2], alcoves: [{ min: [-6, -2.4, -4], max: [-4, 0, -2.1] }, { min: [-6, -2.4, 2.1], max: [-4, 0, 4] }, { min: [4, -2.4, -4], max: [6, 0, -2.1] }, { min: [4, -2.4, 2.1], max: [6, 0, 4] }] };

const props: Prop[] = [{ kind: "sunDisc", pos: [0, 4.8, 0], yaw: 0, scale: 1, seed: 401 }, { kind: "lever", pos: [0, 4.8, 2], yaw: 0, scale: 1, seed: 402 }, { kind: "ropeBridge", pos: [0, 0.3, 23], yaw: Math.PI / 2, scale: 2.7, seed: 403 }, { kind: "ropeBridge", pos: [0, 0.3, 23], yaw: -Math.PI / 2, scale: 2.7, seed: 403 }];
for (const x of [-8, -3, 3, 8]) { const torch: Prop = { kind: "torch", pos: [x, -2.4, -1.55], yaw: 0, scale: 0.75, seed: 410 + x }; props.push(torch, mirrorX(torch)); }
for (const [x, z] of [[-31, -9], [-29, -13], [-32, 10], [-31, 22]] as const) { const prop: Prop = { kind: x === -31 && z === -9 ? "tent" : "giantTree", pos: [x, 0, z], yaw: 0.2, scale: 1, seed: 500 + z }; props.push(prop, mirrorX(prop)); }
for (const box of sunPillars.slice(0, 6)) { const prop: Prop = { kind: "pillar", pos: [(box.min[0] + box.max[0]) / 2, 0, (box.min[2] + box.max[2]) / 2], yaw: 0, scale: 0.7, seed: 600 + props.length }; props.push(prop, mirrorX(prop)); }
props.push({ kind: "waterSurface", pos: [-14, 0.02, -15], yaw: 0, scale: 1.7, seed: 701 }, { kind: "waterSurface", pos: [14, 0.02, -15], yaw: 0, scale: 1.7, seed: 701 });

const sunSpawns: SpawnPoint[] = [-6, -2, 2, 6].map((z) => ({ pos: [-29, 0, z], yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({ pos: [-spawn.pos[0], spawn.pos[1], spawn.pos[2]], yaw: Math.PI / 2 }));

const dressing = jungleDressing({
  idPrefix: "temple",
  seed: 4401,
  bounds: rect(-34, -26, 34, 26),
  blockers: {
    boxes, ramps, volumes, boulders: [boulder], spawns: [...sunSpawns, ...moonSpawns],
    extra: [rect(-36, 19, 36, 27), rect(-2, -12, 2, 12)],
  },
  patchMaterials: ["fern", "canopy", "stone"],
  grassVolumes: volumes,
});
props.push(...dressing.props);
boxes.push(...dressing.patches);

type Node = { id: string; pos: Vec3Tuple };
const nodes: Node[] = [];
for (let index = 0; index < sunSpawns.length; index += 1) nodes.push({ id: `sun-spawn-${index}`, pos: sunSpawns[index]!.pos }, { id: `moon-spawn-${index}`, pos: moonSpawns[index]!.pos });
for (const [id, pos] of [
  ["sun-hub", [-26, 0, 0]], ["moon-hub", [26, 0, 0]],
  ["sun-south", [-20, 0, -11]], ["south-west", [-11, 0, -11]], ["south-center", [0, 0, -11]], ["south-east", [11, 0, -11]], ["moon-south", [20, 0, -11]],
  ["sun-north", [-20, 0, 11]], ["north-west", [-11, 0, 11]], ["north-center", [0, 0, 11]], ["north-east", [11, 0, 11]], ["moon-north", [20, 0, 11]],
  ["sun-tunnel-high", [-18, 0, 0]], ["sun-tunnel-low", [-11, -2.4, 0]], ["tunnel-center", [0, -2.4, 0]], ["moon-tunnel-low", [11, -2.4, 0]], ["moon-tunnel-high", [18, 0, 0]],
  ["ravine-west", [-9, 0, 23]], ["bridge-west", [-7, 0.25, 23]], ["bridge-center", [0, 0.25, 23]], ["bridge-east", [7, 0.25, 23]], ["ravine-east", [9, 0, 23]],
] as readonly (readonly [string, Vec3Tuple])[]) nodes.push({ id, pos });
for (let index = 0; index < 12; index += 1) {
  nodes.push({ id: `altar-s-${index}`, pos: [0, (index + 1) * 0.4, -10 + index * 0.6 + 0.3] });
  nodes.push({ id: `altar-n-${index}`, pos: [0, (index + 1) * 0.4, 10 - index * 0.6 - 0.3] });
}
nodes.push({ id: "altar", pos: [0, 4.8, 0] });
const links = new Map<string, Array<{ to: string; kind: "walk" | "jump" | "drop" | "grapple" }>>();
function connect(a: string, b: string, kind: "walk" | "jump" | "drop" | "grapple" = "jump"): void { const left = links.get(a) ?? []; left.push({ to: b, kind }); links.set(a, left); const right = links.get(b) ?? []; right.push({ to: a, kind }); links.set(b, right); }
for (let index = 0; index < 4; index += 1) connect(`sun-spawn-${index}`, "sun-hub", "walk");
for (let index = 0; index < 4; index += 1) connect(`moon-spawn-${index}`, "moon-hub", "walk");
for (const chain of [["sun-hub","sun-south","south-west","south-center","south-east","moon-south","moon-hub"], ["sun-hub","sun-north","north-west","north-center","north-east","moon-north","moon-hub"]]) for (let index = 1; index < chain.length; index += 1) connect(chain[index - 1]!, chain[index]!, "walk");
for (const chain of [["sun-hub","sun-tunnel-high","sun-tunnel-low","tunnel-center","moon-tunnel-low","moon-tunnel-high","moon-hub"], ["sun-north","ravine-west","bridge-west","bridge-center","bridge-east","ravine-east","moon-north"]]) for (let index = 1; index < chain.length; index += 1) connect(chain[index - 1]!, chain[index]!, index === 2 ? "drop" : index === 5 ? "grapple" : "jump");
connect("south-center", "altar-s-0", "walk"); connect("north-center", "altar-n-0", "walk");
for (const prefix of ["altar-s", "altar-n"]) for (let index = 1; index < 12; index += 1) connect(`${prefix}-${index - 1}`, `${prefix}-${index}`, "walk");
connect("altar-s-11", "altar", "walk"); connect("altar-n-11", "altar", "walk");
const waypoints: Waypoint[] = nodes.map((node) => ({ ...node, links: links.get(node.id) ?? [] }));

export const sunTempleMap: MapData = {
  id: "sun-temple", name: "Sun Temple", bounds: { min: [-36, -5, -28], max: [36, 17, 28] }, boxes, ramps, volumes, zipLines: [], boulders: [boulder], props,
  spawns: { sun: sunSpawns, moon: moonSpawns }, waypoints, decor: [], notes: [{ text: "altar", pos: [0, 6.5, 0] }, { text: "tunnel: listen for the rumble", pos: [-8, 0.2, 0] }], look: { sunShafts: false, stainSeed: 4401 },
};
