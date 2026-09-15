export type Vec3Tuple = readonly [number, number, number];
export type MaterialName = "stone" | "carvedStone" | "wood" | "canopy" | "fern" | "earth" | "water" | "rope" | "gold" | "hazard" | "canvas" | "foliageDark";
export type BoxTag = "solid" | "grapple" | "invisible" | "stairs";

export type Box = {
  id: string;
  min: Vec3Tuple;
  max: Vec3Tuple;
  material: MaterialName;
  tags: readonly BoxTag[];
};

export type SpawnPoint = { pos: Vec3Tuple; yaw: number };
export type MapNote = { text: string; pos: Vec3Tuple };
export type WaypointLink = { to: string; kind: "walk" | "jump" | "drop" };
export type Waypoint = { id: string; pos: Vec3Tuple; links: readonly WaypointLink[] };

export type Decor =
  | { kind: "sun"; pos: Vec3Tuple; radius: number }
  | { kind: "plane"; center: Vec3Tuple; orbitRadius: number; height: number; speed: number }
  | { kind: "spiral"; from: Vec3Tuple; to: Vec3Tuple; rings: number };

export type MapData = {
  id: string;
  name: string;
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  boxes: readonly Box[];
  spawns: { sun: readonly SpawnPoint[]; moon: readonly SpawnPoint[] };
  waypoints: readonly Waypoint[];
  decor: readonly Decor[];
  notes?: readonly MapNote[];
  look?: { sunShafts: boolean; stainSeed: number };
};
