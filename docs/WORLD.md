# Bowdle world: Expedition Journal

From milestone W1 on, this file replaces the notebook look in `RENDERING.md` and the Notebook Page map. W1 updates `RENDERING.md`, `MAP.md`, `GAME.md` and `AGENTS.md` to match it.

## Why the change

The first look (blue ballpoint on ruled notebook paper) sits too close to an existing doodle shooter. Bowdle's world is an explorer's field journal: ink and watercolor sketches of lost jungle ruins on aged parchment. Every map is a page from the same journal.

## The look

Warm sepia ink lines. Loose watercolor washes that pool darker at their edges, with paper grain showing through. A washed sky fading into parchment, a faint map grid, coffee rings and a compass rose. Sparse sepia hatching in deep shadow. Distant things fade into the page. Handwritten notes and arrows point at places worth knowing.

## Never do these

- No ruled notebook lines, no margin line, no blue ballpoint as the world ink.
- No monochrome surfaces. Every surface gets a color wash.
- No names, logos, characters, outfits or likeness from existing adventure franchises. All maps, props, names and statues are original and generic.

## Teams

**Sun** (team 0, orange) and **Moon** (team 1, indigo). W1 renames `red` to `sun` and `green` to `moon` in types, map data, HUD text and tests. Team indices stay 0 and 1.

## Palette (`src/client/render/palette.ts`)

| Name | Hex | Use |
|---|---|---|
| parchment | `#EFE3C6` | Page base |
| parchmentShade | `#D9C79F` | Grain, stains |
| sky | `#A8CFD8` | Top of the sky wash |
| sepia | `#4A3527` | World outlines, hatching, notes |
| sunInk / sunWash | `#D2531F` / `#F2A05A` | Team Sun |
| moonInk / moonWash | `#3346B8` / `#8C99E6` | Team Moon |
| gold / goldInk | `#E3B23C` / `#8A5A12` | Anything interactive: vines, zip anchors, levers |
| hazard / hazardInk | `#C9463D` / `#7A1E17` | Trap telegraphs only |

## Materials

The G-buffer alpha channel stores a **material id** (0 to 31) in place of the old ink id. Boxes, ramps and props carry a `material` name.

| Id | Name | Wash | Outline | Hatch | Granulation |
|---|---|---|---|---|---|
| 0 | background | | | | |
| 1 | stone | `#C9A66B` | sepia | full | 0.6 |
| 2 | carvedStone | `#B8925A` | sepia | full | 0.7, plus procedural glyph strokes on faces |
| 3 | wood | `#9C6B3F` | sepia | light | 0.4 |
| 4 | canopy | `#5E8C3A` | `#2F4A22` | light | 0.5 |
| 5 | fern | `#7FAE4E` | `#3B5A28` | none | 0.4 |
| 6 | earth | `#8A6A45` | sepia | light | 0.8 |
| 7 | water | `#3F8F8C` | `#1F5654` | none | 0.2, plus moving wave strokes |
| 8 | rope | `#B79B6A` | sepia | none | 0 |
| 9 | gold | gold | goldInk | none | 0.3 |
| 10 | teamSun | sunWash | sunInk | light | 0.2 |
| 11 | teamMoon | moonWash | moonInk | light | 0.2 |
| 12 | hazard | hazard | hazardInk | none | 0 |
| 13 | canvas | `#E6D7B0` | sepia | light | 0.3 |
| 14 | foliageDark | `#3F6B2C` | `#25401B` | light | 0.5 |

## Composite pass v2

Keep passes A, B and C and the G-buffer layout (normal xy, tone, id). Pass C changes to:

1. **Background:** vertical wash from `sky` at the top to parchment at 55% of screen height. Parchment grain (2 px cells, plus or minus 3%). Map grid every 64 CSS px at 7% sepia. Two coffee rings per map (seeded position, radius 90 to 160 px, 10% opacity). A compass rose in the upper right sky at 20% opacity.
2. **Surface wash:** `mix(parchment, wash, 0.45 + 0.45 * (1 - tone))`, multiplied by value noise at 4 CSS px scaled by the material's granulation. Darken the wash by 18% within 3 CSS px of an edge (pigment pooling).
3. **Hatching:** light materials get 45 degree sepia lines 9 px apart at 45% opacity where tone is below 0.45. Full materials also get -45 degree lines where tone is below 0.25.
4. **Outlines:** the material's outline color, 1.8 CSS px. Boil at 6 fps, 1 px amplitude.
5. **Depth fade:** blend toward the background color between 35 m and 120 m. Outlines thin to 1 px beyond 60 m.
6. **Water:** screen-space wave strokes 10 px apart drifting at 12 px per second, in the water outline color at 50% opacity.
7. **Sun shafts** (maps that enable them): four soft diagonal bands that lighten by 12% and drift slowly.

Render-only numbers live in `src/client/render/look.ts`. Gameplay numbers stay in `src/shared/constants.ts`. W1 adds this exception to `AGENTS.md`.

## Floating notes

Up to 6 handwritten labels per map ("altar", "tunnel: listen for the rumble", an arrow toward a shortcut). Drawn after the composite pass as screen-projected text in sepia, fading with distance. A setting hides them (M8).

## Map kit v2 (W2)

New `MapData` fields. Colliders stay axis-aligned, ramps are axis-aligned wedges.

```ts
export type MaterialName =
  | "stone" | "carvedStone" | "wood" | "canopy" | "fern" | "earth" | "water"
  | "rope" | "gold" | "hazard" | "canvas" | "foliageDark";

export type Ramp = { id: string; min: Vec3Tuple; max: Vec3Tuple; up: "+x" | "-x" | "+z" | "-z"; material: MaterialName; tags: readonly BoxTag[] };
export type Volume = { id: string; min: Vec3Tuple; max: Vec3Tuple; kind: "water" | "tallGrass"; flood?: boolean };
export type ZipLine = { id: string; from: Vec3Tuple; to: Vec3Tuple };   // from is the higher end
export type Boulder = {
  id: string; path: readonly Vec3Tuple[]; lever: Vec3Tuple;
  alcoves: readonly { min: Vec3Tuple; max: Vec3Tuple }[];
};
export type Prop = { kind: PropKind; pos: Vec3Tuple; yaw: number; scale: number; seed: number };

// MapData gains: ramps, volumes, zipLines, boulders, props, notes, look: { sunShafts: boolean; stainSeed: number }
```

### New constants (`src/shared/constants.ts`)

| Name | Value | Notes |
|---|---|---|
| `RAMP_MAX_SLOPE_DEG` | 40 | |
| `GROUND_SNAP` | 0.3 | Stay grounded walking down ramps and steps |
| `WATER_SPEED_MULT` | 0.65 | No sliding in water. Arrows stop at the surface with a splash |
| `ZIP_SPEED` | 14 | m/s |
| `ZIP_ATTACH_DIST` | 2 | Only at the higher end |
| `ZIP_JUMP_BOOST` | 3 | Upward m/s when jumping off |
| `BOULDER_RADIUS` | 1.5 | |
| `BOULDER_SPEED` | 11 | m/s along the path |
| `BOULDER_PERIOD_MS` | 75000 | Automatic roll, direction alternates |
| `BOULDER_TELEGRAPH_MS` | 3000 | Rumble, dust, glowing dotted path |
| `LEVER_COOLDOWN_MS` | 60000 | Shared by both teams |
| `FLOOD_PERIOD_MS` | 120000 | |
| `FLOOD_MS` | 25000 | |
| `FLOOD_RISE` | 0.6 | m |
| `USE_DIST` | 1.5 | Levers |

New input button: `USE` on F. Widen `buttons` to 16 bits if it is narrower.

### Behaviors

- **Ramps:** players walk up and down smoothly. Arrows hit the sloped surface.
- **Tall grass:** a crouched player fully inside is invisible to bots. Humans still see them through the blades.
- **Zip lines:** press USE near the higher end. Ride to the other end at `ZIP_SPEED`, drawing and firing allowed. Jump to let go with current velocity plus the boost. Grapple cancels the ride. `PlayerState` gains `zipId`, `zipT`.
- **Boulder:** server-authoritative state in `MatchState.hazards`. Idle, telegraph, roll along the path, despawn. Touching it kills instantly (weapon `boulder`) and it blocks arrows. A player who pulls the lever gets the kill credit and a "Trap!" banner. Alcoves along the path are always safe.
- **Flood:** water volumes marked `flood` rise by `FLOOD_RISE` for `FLOOD_MS` every `FLOOD_PERIOD_MS`, a pure function of match time.
- **Bots:** waypoint links gain `zip` and `grapple` kinds. Bots leave the boulder path during telegraph and roll, and never pull levers.

## Props (W3)

All procedural, one `InstancedMesh` per kind where possible.

| Kind | Build |
|---|---|
| giantTree | Tapered trunk, 4 buttress roots, canopy of 8 low-poly blobs, hanging vines. Collision is authored separately as a trunk box |
| palm, fernClump, grassPatch | Low-poly leaves, instanced blades |
| fallenLog, rockPile | Cylinders and blobs |
| templeBlock, pillar, brokenPillar, stepTier | Stone with carved glyph strokes |
| sunDisc, stoneHead, torch, brazier | Generic carvings, flickering flame blobs |
| ropeBridge, zipRope, lever, vineWall | Planks and ropes (sway is visual only), gold anchors |
| waterfall, waterSurface, mist | Scrolling strokes and soft blobs |
| tent, crate, lantern, mapTable | Expedition camp |
| planeWreck | Generic old seaplane: fuselage tube, broken wing, bent propeller, no markings |

Budgets: 150 draw calls or fewer, 300k triangles on screen or fewer, props beyond 90 m hidden.

## Ambient audio (W3, procedural)

- Jungle bed: band-passed insect noise with slow tremolo, seeded bird chirps every 2 to 7 s, soft wind.
- Water: low-passed noise scaled by distance to the nearest water volume.
- Boulder: low rumble during telegraph, stone roll while moving. Lever clunk.
- Zip line: rope whine rising with speed.
