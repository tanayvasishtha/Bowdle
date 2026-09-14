# Bowdle maps

Maps are TypeScript modules in `src/shared/maps/`. They are pure data plus two small helpers, so the server (collision, bots) and the client (rendering) read the exact same geometry.

## Format

```ts
// src/shared/maps/types.ts
export type Vec3Tuple = readonly [number, number, number];
export type InkName = "blue" | "red" | "green" | "orange" | "none";
export type BoxTag = "solid" | "grapple" | "invisible" | "stairs";

export type Box = {
  id: string;
  min: Vec3Tuple;
  max: Vec3Tuple;
  ink: InkName;              // outline color, see RENDERING.md
  tags: readonly BoxTag[];   // "solid" collides with players and arrows
};

export type SpawnPoint = { pos: Vec3Tuple; yaw: number };

export type Waypoint = {
  id: string;
  pos: Vec3Tuple;                  // standing position, feet on the surface
  links: readonly WaypointLink[];
};
export type WaypointLink = { to: string; kind: "walk" | "jump" | "drop" };

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
  decor: readonly Decor[];          // client only, never collides
};
```

All collision geometry is **axis-aligned boxes**. No slopes, no meshes. Stairs are stacked boxes.

## Helpers

```ts
mirrorX(box: Box, newId: string): Box          // x -> -x, swaps min.x/max.x
stairs(opts: {
  idPrefix: string;
  start: Vec3Tuple;       // ground-level corner where the first step begins
  dir: "+x" | "-x" | "+z" | "-z";
  steps: number;
  rise: number;           // must be <= STEP_HEIGHT
  run: number;            // depth of each step
  width: number;
  ink: InkName;
}): Box[]
```

Build the red half of the map, then generate the green half with `mirrorX`. Boxes that cross `x = 0` must be symmetric on their own.

## Map 1: Notebook Page (`notebook.ts`)

Play area 60 m by 40 m. Teams face each other along X. Red spawns on the west (-X), Green on the east (+X).

### Shell

| Id | min | max | ink | tags |
|---|---|---|---|---|
| floor | (-32, -1, -22) | (32, 0, 22) | blue | solid |
| wall-west | (-32, 0, -22) | (-30, 6, 22) | blue | solid |
| wall-east | (30, 0, -22) | (32, 6, 22) | blue | solid |
| wall-north | (-32, 0, 20) | (32, 6, 22) | blue | solid |
| wall-south | (-32, 0, -22) | (32, 6, -20) | blue | solid |
| ceiling | (-32, 12, -22) | (32, 13, 22) | none | solid, invisible |

### Red half (mirror each for Green)

| Id | min | max | tags | Purpose |
|---|---|---|---|---|
| spawn-cover | (-24, 0, -3) | (-22.5, 1.2, 3) | solid | Notebook stack shielding spawn |
| sharpener-n | (-17, 0, 3) | (-15.5, 1.6, 6) | solid | Mid-lane cover |
| sharpener-s | (-17, 0, -6) | (-15.5, 1.6, -3) | solid | Mid-lane cover |
| mug | (-20, 0, 7.5) | (-17, 3.5, 10.5) | solid, grapple | Tall coffee mug block |
| pencil-case | (-11, 0, -13) | (-5, 1.3, -11.5) | solid | Long low cover, south lane |
| eraser-n | (-6.5, 0, 5.5) | (-5, 1.1, 8.5) | solid | Low wall near center |
| eraser-s | (-6.5, 0, -8.5) | (-5, 1.1, -5.5) | solid | Low wall near center |
| pillar | (-12.8, 0, 11.4) | (-11.6, 2.7, 12.6) | solid | Pencil holding up the bridge |
| perch | (-15, 0, -18) | (-13, 4, -16) | solid, grapple | Ruler tower, sniper spot |
| stairs to bridge | `stairs({ start: (-19, 0, 11), dir: "+x", steps: 6, rise: 0.45, run: 1.0, width: 2 })` | | solid, stairs | Reaches y 2.7 next to the pillar |
| stairs to perch | `stairs({ start: (-14.5, 0, -10), dir: "-z", steps: 9, rise: 0.44, run: 0.65, width: 1.2 })` | | solid, stairs | Ends at the perch top |

### Center pieces (self-symmetric)

| Id | min | max | tags |
|---|---|---|---|
| book-stack | (-4, 0, -3) | (4, 1.0, 3) | solid |
| center-eraser | (-1.5, 1.0, -0.6) | (1.5, 2.0, 0.6) | solid |
| ruler-bridge | (-12, 2.7, 11) | (12, 3.0, 13) | solid, grapple |

### Spawns

Red: `(-27, 0, -4.5)`, `(-27, 0, -1.5)`, `(-27, 0, 1.5)`, `(-27, 0, 4.5)`, all `yaw = -PI/2` (facing +X).
Green: same points with x negated, `yaw = PI/2`.

### Decor

- A doodle sun at `(0, 28, -70)`, radius 6.
- Two paper planes orbiting the center at heights 16 and 19.
- Notebook spiral rings along the top of the north wall.

### Waypoints

About 40 nodes, authored on the red half and mirrored. Required coverage: each spawn, both ends and the middle of each lane (north under the bridge, bridge top, center, south lane), stair bottoms and tops, the perch top, beside every cover piece. Link kinds: `walk` for flat or stair paths, `jump` for gaps up to 1.2 m high, `drop` for ledges down to 3 m.

### Tuning notes

The stair and perch numbers above are a starting point. If validation fails, adjust positions by the smallest amount that passes and write down the change in the commit message.

## Map 2: Practice Range (`range.ts`)

- A 20 m wide, 80 m long lane along -Z, player starts at `(0, 0, 0)` facing -Z.
- Standing targets at 10, 20, 30, 45 and 60 m.
- Two moving targets on rails at 25 m and 40 m, moving side to side at 4 m/s and 7 m/s.
- A slide lane with low bars (1.1 m) to practice sliding under, and a row of boxes rising by 0.45 m to practice step-ups.
- Targets use the player hitbox sizes so practice transfers to real fights.

## Validation (unit tests, required)

`src/shared/maps/validate.ts` exports `validateMap(map): string[]` (empty array means valid). Tests run it on every map.

1. Every box has `min < max` on all three axes.
2. Every box is inside `bounds`.
3. Notebook Page is mirror symmetric across `x = 0` for all `solid` boxes (tolerance 1e-6).
4. No spawn capsule overlaps a solid box, and every spawn has a solid top surface within 0.05 m below its feet.
5. Adjacent stair steps differ in height by at most `STEP_HEIGHT`.
6. The waypoint graph is connected.
7. Every `walk` link passes a capsule sweep at standing height with step-up allowed.
8. Every spawn has a waypoint within 3 m with clear line of sight.
9. No red spawn has line of sight to any green spawn (eye height to eye height).
