export type Vec3Tuple = readonly [number, number, number];
export type InkName = "blue" | "red" | "green" | "orange" | "none";
export type BoxTag = "solid" | "grapple" | "invisible" | "stairs";

export type Box = {
  id: string;
  min: Vec3Tuple;
  max: Vec3Tuple;
  ink: InkName;
  tags: readonly BoxTag[];
};

export type SpawnPoint = { pos: Vec3Tuple; yaw: number };
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
  spawns: { red: readonly SpawnPoint[]; green: readonly SpawnPoint[] };
  waypoints: readonly Waypoint[];
  decor: readonly Decor[];
};
