export type Vec3Tuple = readonly [number, number, number];
export type MaterialName = "stone" | "carvedStone" | "wood" | "canopy" | "fern" | "earth" | "water" | "rope" | "gold" | "hazard" | "canvas" | "foliageDark";
export type BoxTag = "solid" | "grapple" | "invisible" | "stairs";
export type RampDirection = "+x" | "-x" | "+z" | "-z";

export type Box = {
  id: string;
  min: Vec3Tuple;
  max: Vec3Tuple;
  material: MaterialName;
  tags: readonly BoxTag[];
};

export type SpawnPoint = { pos: Vec3Tuple; yaw: number };
export type MapNote = { text: string; pos: Vec3Tuple };
export type WaypointLink = { to: string; kind: "walk" | "jump" | "drop" | "zip" | "grapple" | "mantle" };
export type Waypoint = { id: string; pos: Vec3Tuple; links: readonly WaypointLink[] };

export type Ramp = { id: string; min: Vec3Tuple; max: Vec3Tuple; up: RampDirection; material: MaterialName; tags: readonly BoxTag[] };
export type Volume = { id: string; min: Vec3Tuple; max: Vec3Tuple; kind: "water" | "tallGrass"; flood?: boolean };
export type ZipLine = { id: string; from: Vec3Tuple; to: Vec3Tuple };
export type Boulder = { id: string; path: readonly Vec3Tuple[]; lever: Vec3Tuple; alcoves: readonly { min: Vec3Tuple; max: Vec3Tuple }[] };
export type PropKind = "giantTree" | "palm" | "fernClump" | "grassPatch" | "fallenLog" | "rockPile" | "templeBlock" | "pillar" | "brokenPillar" | "stepTier" | "sunDisc" | "stoneHead" | "torch" | "brazier" | "ropeBridge" | "zipRope" | "lever" | "vineWall" | "waterfall" | "waterSurface" | "mist" | "tent" | "crate" | "lantern" | "mapTable" | "planeWreck";
export type Prop = { kind: PropKind; pos: Vec3Tuple; yaw: number; scale: number; seed: number };

export type Decor =
  | { kind: "sun"; pos: Vec3Tuple; radius: number }
  | { kind: "plane"; center: Vec3Tuple; orbitRadius: number; height: number; speed: number }
  | { kind: "spiral"; from: Vec3Tuple; to: Vec3Tuple; rings: number };

export type ZoneBox = { min: Vec3Tuple; max: Vec3Tuple };

/** Swing anchor that moves on a sine from match time. Grapple targets sample this each tick. */
export type SwingAnchor = {
  id: string;
  pos: Vec3Tuple;
  sway: { axis: "x" | "y" | "z"; amplitude: number; periodS: number };
};
/** Upward launch pad. */
export type Geyser = { id: string; pos: Vec3Tuple; radius: number; launch: number };
/** Plank wall or crate the server tracks for HP and rebuild. */
/** burnOnly: arrows stop at it without breaking it; only a Torch Bearer's fire does (the Home Grove hut fences). */
export type Breakable = { id: string; box: { min: Vec3Tuple; max: Vec3Tuple }; hp: number; burnOnly?: boolean };
/** PvP heal pickup. Distinct from Expedition herbSpawns. */
export type Herb = { id: string; pos: Vec3Tuple };
/** Optional flood timing for maps that override the global Lost River flood clock (Sunken Ruins tide). */
export type FloodTiming = { periodMs: number; activeMs: number; rise: number };

export type MapData = {
  /** Relic Run: where the relic rests, and each team's capture zone. */
  relic?: Vec3Tuple;
  camps?: { sun: ZoneBox; moon: ZoneBox };
  /** Expedition: where creatures enter and where herbs grow between waves. */
  creatureSpawns?: readonly Vec3Tuple[];
  herbSpawns?: readonly Vec3Tuple[];
  /** Village Defense: where the totem stands. Raiders attack it and the run ends when it falls. */
  totem?: Vec3Tuple;
  /** Map kit v3 (G10). Omit or use empty arrays when unused. */
  anchors?: readonly SwingAnchor[];
  geysers?: readonly Geyser[];
  breakables?: readonly Breakable[];
  herbs?: readonly Herb[];
  flood?: FloodTiming;
  id: string;
  name: string;
  bounds: { min: Vec3Tuple; max: Vec3Tuple };
  boxes: readonly Box[];
  ramps: readonly Ramp[];
  volumes: readonly Volume[];
  zipLines: readonly ZipLine[];
  boulders: readonly Boulder[];
  props: readonly Prop[];
  spawns: { sun: readonly SpawnPoint[]; moon: readonly SpawnPoint[] };
  waypoints: readonly Waypoint[];
  decor: readonly Decor[];
  notes: readonly MapNote[];
  look: { sunShafts: boolean; stainSeed: number };
  /** A point every team should be able to see from its spawn area, such as the top of the central landmark. */
  landmark?: Vec3Tuple;
};
