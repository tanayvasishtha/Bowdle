import { mirrorX, stairs } from "./helpers.ts";
import type { Box, MapData, SpawnPoint, Vec3Tuple, Waypoint, WaypointLink } from "./types.ts";

const solid = ["solid"] as const;
const sunHalf: Box[] = [
  { id: "sun-spawn-cover", min: [-24, 0, -3], max: [-22.5, 1.2, 3], material: "wood", tags: solid },
  { id: "sun-sharpener-n", min: [-17, 0, 0], max: [-15.5, 2, 6], material: "stone", tags: solid },
  { id: "sun-sharpener-s", min: [-17, 0, -6], max: [-15.5, 2, 0], material: "stone", tags: solid },
  { id: "sun-mug", min: [-20, 0, 7.5], max: [-17, 3.5, 10.5], material: "gold", tags: ["solid", "grapple"] },
  { id: "sun-pencil-case", min: [-11, 0, -13], max: [-5, 1.3, -11.5], material: "wood", tags: solid },
  { id: "sun-eraser-n", min: [-6.5, 0, 5.5], max: [-5, 1.1, 8.5], material: "stone", tags: solid },
  { id: "sun-eraser-s", min: [-6.5, 0, -8.5], max: [-5, 1.1, -5.5], material: "stone", tags: solid },
  { id: "sun-pillar", min: [-12.8, 0, 11.4], max: [-11.6, 2.7, 12.6], material: "carvedStone", tags: solid },
  { id: "sun-perch", min: [-15, 0, -18], max: [-13, 4, -16], material: "gold", tags: ["solid", "grapple"] },
  ...stairs({ idPrefix: "sun-bridge-step", start: [-19, 0, 11], dir: "+x", steps: 6, rise: 0.45, run: 1, width: 2, material: "stone" }),
  ...stairs({ idPrefix: "sun-perch-step", start: [-14.5, 0, -10], dir: "-z", steps: 9, rise: 0.44, run: 0.65, width: 1.2, material: "stone" }),
];

const shell: Box[] = [
  { id: "floor", min: [-32, -1, -22], max: [32, 0, 22], material: "earth", tags: solid },
  { id: "wall-west", min: [-32, 0, -22], max: [-30, 6, 22], material: "foliageDark", tags: solid },
  { id: "wall-east", min: [30, 0, -22], max: [32, 6, 22], material: "foliageDark", tags: solid },
  { id: "wall-north", min: [-32, 0, 20], max: [32, 6, 22], material: "foliageDark", tags: solid },
  { id: "wall-south", min: [-32, 0, -22], max: [32, 6, -20], material: "foliageDark", tags: solid },
  { id: "ceiling", min: [-32, 12, -22], max: [32, 13, 22], material: "stone", tags: ["solid", "invisible"] },
  { id: "book-stack", min: [-4, 0, -3], max: [4, 1, 3], material: "carvedStone", tags: solid },
  { id: "center-eraser", min: [-1.5, 1, -0.6], max: [1.5, 2, 0.6], material: "wood", tags: solid },
  { id: "ruler-bridge", min: [-12, 2.7, 11], max: [12, 3, 13], material: "gold", tags: ["solid", "grapple"] },
];

const moonHalf = sunHalf.map((box) => mirrorX(box, box.id.replace("sun-", "moon-")));
const sunSpawns: SpawnPoint[] = [-4.5, -1.5, 1.5, 4.5].map((z) => ({ pos: [-27, 0, z], yaw: -Math.PI / 2 }));
const moonSpawns: SpawnPoint[] = sunSpawns.map((spawn) => ({ pos: [-spawn.pos[0], spawn.pos[1], spawn.pos[2]], yaw: Math.PI / 2 }));

type MutableWaypoint = { id: string; pos: Vec3Tuple; links: WaypointLink[] };
type Edge = readonly [string, string, WaypointLink["kind"]];

const sunWaypointPositions: ReadonlyArray<readonly [string, Vec3Tuple]> = [
  ["sun-south-edge", [-27, 0, -9]], ["sun-south-mid", [-14, 0, -9]], ["sun-south-inner", [-7, 0, -9]],
  ["sun-spawn-s4", [-27, 0, -4.5]], ["sun-spawn-s2", [-27, 0, -1.5]], ["sun-spawn-n2", [-27, 0, 1.5]], ["sun-spawn-n4", [-27, 0, 4.5]],
  ["sun-north-edge", [-27, 0, 15]], ["sun-north-mid", [-16, 0, 15]], ["sun-north-inner", [-8, 0, 15]],
  ["sun-bridge-bottom", [-19.5, 0, 12]], ["sun-bridge-top", [-11.5, 3, 12]],
  ["sun-perch-bottom", [-13.9, 0, -9.5]], ["sun-perch-top", [-14, 4, -17]],
  ["sun-mug-side", [-21, 0, 9]], ["sun-sharpener-side", [-18, 0, -3]], ["sun-eraser-side", [-7.5, 0, 7]], ["sun-pencil-side", [-8, 0, -10.5]],
];

const sunEdges: readonly Edge[] = [
  ["sun-south-edge", "sun-south-mid", "walk"], ["sun-south-mid", "sun-south-inner", "walk"], ["sun-south-inner", "center-south", "walk"],
  ["sun-south-edge", "sun-spawn-s4", "walk"], ["sun-spawn-s4", "sun-spawn-s2", "walk"], ["sun-spawn-s2", "sun-spawn-n2", "walk"], ["sun-spawn-n2", "sun-spawn-n4", "walk"], ["sun-spawn-n4", "sun-north-edge", "walk"],
  ["sun-north-edge", "sun-north-mid", "walk"], ["sun-north-mid", "sun-north-inner", "walk"], ["sun-north-inner", "center-north", "walk"],
  ["sun-north-edge", "sun-mug-side", "walk"], ["sun-north-mid", "sun-bridge-bottom", "jump"], ["sun-bridge-bottom", "sun-bridge-top", "walk"],
  ["sun-south-mid", "sun-perch-bottom", "walk"], ["sun-perch-bottom", "sun-perch-top", "walk"],
  ["sun-spawn-s2", "sun-sharpener-side", "jump"], ["sun-sharpener-side", "sun-south-mid", "jump"],
  ["sun-north-inner", "sun-eraser-side", "walk"], ["sun-eraser-side", "center-north", "jump"], ["sun-south-inner", "sun-pencil-side", "walk"],
];

function notebookWaypoints(): Waypoint[] {
  const points: MutableWaypoint[] = [
    { id: "center-south", pos: [0, 0, -9], links: [] }, { id: "center-north", pos: [0, 0, 15], links: [] },
  ];
  for (const [id, pos] of sunWaypointPositions) {
    points.push({ id, pos, links: [] });
    points.push({ id: id.replace("sun-", "moon-"), pos: [-pos[0], pos[1], pos[2]], links: [] });
  }
  const byId = new Map(points.map((point) => [point.id, point]));
  const connect = (from: string, to: string, kind: WaypointLink["kind"]): void => {
    byId.get(from)!.links.push({ to, kind }); byId.get(to)!.links.push({ to: from, kind });
  };
  for (const edge of sunEdges) {
    connect(...edge);
    connect(edge[0].replace("sun-", "moon-"), edge[1].replace("sun-", "moon-"), edge[2]);
  }
  return points;
}

export const notebookMap: MapData = {
  id: "notebook",
  name: "Notebook Page",
  bounds: { min: [-32, -1, -22], max: [32, 13, 22] },
  boxes: [...shell, ...sunHalf, ...moonHalf],
  ramps: [], volumes: [], zipLines: [], boulders: [], props: [],
  spawns: { sun: sunSpawns, moon: moonSpawns },
  waypoints: notebookWaypoints(),
  decor: [
    { kind: "sun", pos: [0, 28, -70], radius: 6 },
    { kind: "plane", center: [0, 0, 0], orbitRadius: 18, height: 16, speed: 0.08 },
    { kind: "plane", center: [0, 0, 0], orbitRadius: 24, height: 19, speed: -0.05 },
    { kind: "spiral", from: [-28, 7, 21], to: [28, 7, 21], rings: 18 },
  ],
  notes: [{ text: "high crossing", pos: [0, 4, 12] }, { text: "gold marks a shortcut", pos: [-18, 4, 9] }],
  look: { sunShafts: false, stainSeed: 1701 },
};
