import { mirrorX, stairs } from "./helpers.ts";
import type { Box, MapData, SpawnPoint, Vec3Tuple, Waypoint, WaypointLink } from "./types.ts";

const solid = ["solid"] as const;
const redHalf: Box[] = [
  { id: "red-spawn-cover", min: [-24, 0, -3], max: [-22.5, 1.2, 3], ink: "blue", tags: solid },
  { id: "red-sharpener-n", min: [-17, 0, 0], max: [-15.5, 2, 6], ink: "blue", tags: solid },
  { id: "red-sharpener-s", min: [-17, 0, -6], max: [-15.5, 2, 0], ink: "blue", tags: solid },
  { id: "red-mug", min: [-20, 0, 7.5], max: [-17, 3.5, 10.5], ink: "orange", tags: ["solid", "grapple"] },
  { id: "red-pencil-case", min: [-11, 0, -13], max: [-5, 1.3, -11.5], ink: "blue", tags: solid },
  { id: "red-eraser-n", min: [-6.5, 0, 5.5], max: [-5, 1.1, 8.5], ink: "blue", tags: solid },
  { id: "red-eraser-s", min: [-6.5, 0, -8.5], max: [-5, 1.1, -5.5], ink: "blue", tags: solid },
  { id: "red-pillar", min: [-12.8, 0, 11.4], max: [-11.6, 2.7, 12.6], ink: "blue", tags: solid },
  { id: "red-perch", min: [-15, 0, -18], max: [-13, 4, -16], ink: "orange", tags: ["solid", "grapple"] },
  ...stairs({ idPrefix: "red-bridge-step", start: [-19, 0, 11], dir: "+x", steps: 6, rise: 0.45, run: 1, width: 2, ink: "blue" }),
  ...stairs({ idPrefix: "red-perch-step", start: [-14.5, 0, -10], dir: "-z", steps: 9, rise: 0.44, run: 0.65, width: 1.2, ink: "blue" }),
];

const shell: Box[] = [
  { id: "floor", min: [-32, -1, -22], max: [32, 0, 22], ink: "blue", tags: solid },
  { id: "wall-west", min: [-32, 0, -22], max: [-30, 6, 22], ink: "blue", tags: solid },
  { id: "wall-east", min: [30, 0, -22], max: [32, 6, 22], ink: "blue", tags: solid },
  { id: "wall-north", min: [-32, 0, 20], max: [32, 6, 22], ink: "blue", tags: solid },
  { id: "wall-south", min: [-32, 0, -22], max: [32, 6, -20], ink: "blue", tags: solid },
  { id: "ceiling", min: [-32, 12, -22], max: [32, 13, 22], ink: "none", tags: ["solid", "invisible"] },
  { id: "book-stack", min: [-4, 0, -3], max: [4, 1, 3], ink: "blue", tags: solid },
  { id: "center-eraser", min: [-1.5, 1, -0.6], max: [1.5, 2, 0.6], ink: "blue", tags: solid },
  { id: "ruler-bridge", min: [-12, 2.7, 11], max: [12, 3, 13], ink: "orange", tags: ["solid", "grapple"] },
];

const greenHalf = redHalf.map((box) => mirrorX(box, box.id.replace("red-", "green-")));
const redSpawns: SpawnPoint[] = [-4.5, -1.5, 1.5, 4.5].map((z) => ({ pos: [-27, 0, z], yaw: -Math.PI / 2 }));
const greenSpawns: SpawnPoint[] = redSpawns.map((spawn) => ({ pos: [-spawn.pos[0], spawn.pos[1], spawn.pos[2]], yaw: Math.PI / 2 }));

type MutableWaypoint = { id: string; pos: Vec3Tuple; links: WaypointLink[] };
type Edge = readonly [string, string, WaypointLink["kind"]];

const redWaypointPositions: ReadonlyArray<readonly [string, Vec3Tuple]> = [
  ["red-south-edge", [-27, 0, -9]], ["red-south-mid", [-14, 0, -9]], ["red-south-inner", [-7, 0, -9]],
  ["red-spawn-s4", [-27, 0, -4.5]], ["red-spawn-s2", [-27, 0, -1.5]], ["red-spawn-n2", [-27, 0, 1.5]], ["red-spawn-n4", [-27, 0, 4.5]],
  ["red-north-edge", [-27, 0, 15]], ["red-north-mid", [-16, 0, 15]], ["red-north-inner", [-8, 0, 15]],
  ["red-bridge-bottom", [-19.5, 0, 12]], ["red-bridge-top", [-11.5, 3, 12]],
  ["red-perch-bottom", [-13.9, 0, -9.5]], ["red-perch-top", [-14, 4, -17]],
  ["red-mug-side", [-21, 0, 9]], ["red-sharpener-side", [-18, 0, -3]], ["red-eraser-side", [-7.5, 0, 7]], ["red-pencil-side", [-8, 0, -10.5]],
];

const redEdges: readonly Edge[] = [
  ["red-south-edge", "red-south-mid", "walk"], ["red-south-mid", "red-south-inner", "walk"], ["red-south-inner", "center-south", "walk"],
  ["red-south-edge", "red-spawn-s4", "walk"], ["red-spawn-s4", "red-spawn-s2", "walk"], ["red-spawn-s2", "red-spawn-n2", "walk"], ["red-spawn-n2", "red-spawn-n4", "walk"], ["red-spawn-n4", "red-north-edge", "walk"],
  ["red-north-edge", "red-north-mid", "walk"], ["red-north-mid", "red-north-inner", "walk"], ["red-north-inner", "center-north", "walk"],
  ["red-north-edge", "red-mug-side", "walk"], ["red-north-mid", "red-bridge-bottom", "jump"], ["red-bridge-bottom", "red-bridge-top", "walk"],
  ["red-south-mid", "red-perch-bottom", "walk"], ["red-perch-bottom", "red-perch-top", "walk"],
  ["red-spawn-s2", "red-sharpener-side", "jump"], ["red-sharpener-side", "red-south-mid", "jump"],
  ["red-north-inner", "red-eraser-side", "walk"], ["red-eraser-side", "center-north", "jump"], ["red-south-inner", "red-pencil-side", "walk"],
];

function notebookWaypoints(): Waypoint[] {
  const points: MutableWaypoint[] = [
    { id: "center-south", pos: [0, 0, -9], links: [] }, { id: "center-north", pos: [0, 0, 15], links: [] },
  ];
  for (const [id, pos] of redWaypointPositions) {
    points.push({ id, pos, links: [] });
    points.push({ id: id.replace("red-", "green-"), pos: [-pos[0], pos[1], pos[2]], links: [] });
  }
  const byId = new Map(points.map((point) => [point.id, point]));
  const connect = (from: string, to: string, kind: WaypointLink["kind"]): void => {
    byId.get(from)!.links.push({ to, kind }); byId.get(to)!.links.push({ to: from, kind });
  };
  for (const edge of redEdges) {
    connect(...edge);
    connect(edge[0].replace("red-", "green-"), edge[1].replace("red-", "green-"), edge[2]);
  }
  return points;
}

export const notebookMap: MapData = {
  id: "notebook",
  name: "Notebook Page",
  bounds: { min: [-32, -1, -22], max: [32, 13, 22] },
  boxes: [...shell, ...redHalf, ...greenHalf],
  spawns: { red: redSpawns, green: greenSpawns },
  waypoints: notebookWaypoints(),
  decor: [
    { kind: "sun", pos: [0, 28, -70], radius: 6 },
    { kind: "plane", center: [0, 0, 0], orbitRadius: 18, height: 16, speed: 0.08 },
    { kind: "plane", center: [0, 0, 0], orbitRadius: 24, height: 19, speed: -0.05 },
    { kind: "spiral", from: [-28, 7, 21], to: [28, 7, 21], rings: 18 },
  ],
};
