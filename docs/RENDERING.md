# Bowdle rendering

## The look

Blue ballpoint pen on cream notebook paper. Every edge is an ink outline that wobbles slightly, as if redrawn a few times per second. Shadows are pen hatching. Team members are outlined in red or green ink. Interactive things (grapple points, pickups) are outlined in orange.

Our own style choices, so Bowdle does not look like other doodle games:

- Ruled page lines appear only in empty background, never over geometry.
- Hatching gets denser in three steps and uses the ink color of the object.
- Team colors are red and green on a blue ink world.
- Fonts are Gochi Hand (HUD) and Permanent Marker (titles).

## Palette (`src/client/render/palette.ts`)

| Name | Hex | Ink id |
|---|---|---|
| Paper | `#F3EEDF` | |
| Ruled line | `#A9C4E8` | |
| Margin line | `#E39A9A` | |
| Background (no object) | | 0 |
| Blue ink (world) | `#233C9B` | 1 |
| Red team | `#D1382F` | 2 |
| Green team | `#2F9E57` | 3 |
| Orange highlight | `#F08A24` | 4 |

Map boxes carry an `ink` name (see `MAP.md`). The client converts it to an ink id.

## Pipeline

Three passes per frame with `WebGLRenderer`. No `EffectComposer`: we manage render targets directly.

### Pass A: world G-buffer

- Target: `WebGLRenderTarget`, RGBA8, with a `DepthTexture` attached.
- Every world mesh uses `InkMaterial`: a `ShaderMaterial` with `glslVersion: THREE.GLSL3` and one uniform, `inkId`.
- Output per pixel:
  - `R, G` = view-space normal `xy * 0.5 + 0.5`
  - `B` = tone: `0.35 + 0.65 * max(dot(worldNormal, LIGHT_DIR), 0.0)`, with `LIGHT_DIR = normalize(vec3(0.4, 1.0, 0.3))`
  - `A` = `inkId / 255.0`
- Clear color `(0.5, 0.5, 1.0, 0.0)`: facing the camera, full tone, ink id 0.

### Pass B: viewmodel G-buffer

- Same format, separate target and depth texture.
- Separate scene and camera for the first-person bow and hand: FOV 70, near 0.01, far 10.
- Keeps the bow from clipping into walls.

### Pass C: composite

One full-screen triangle with an orthographic camera. The shader reads both G-buffers and both depth textures and writes the final color to the canvas.

Work in CSS pixels: `p = gl_FragCoord.xy / devicePixelRatio / renderScale`, so line spacing looks the same on every screen.

1. **Paper:** paper color plus grain, `hash(floor(p / 2.0))` scaled to plus or minus 0.02.
2. **Boil:** `step = floor(time * 8.0)`. Offset every edge and hatch lookup by `(hash2(floor(p / 3.0) + step) - 0.5) * 1.2` CSS px.
3. **Edges:** sample at plus or minus 1.5 CSS px around the pixel.
   - Depth edge: Sobel on linearized depth divided by the center depth, threshold 0.08.
   - Normal edge: Sobel on decoded normals, magnitude threshold 0.35.
   - Edge color: ink of the nearest sample (smallest depth) in the 3×3 neighborhood.
4. **Hatching**, using tone `t` from the B channel and the pixel's ink color at 55% opacity:
   - `t < 0.80`: lines at 45 degrees, 8 px apart, 1 px wide
   - `t < 0.55`: add lines at -45 degrees, 8 px apart
   - `t < 0.30`: add horizontal lines, 5 px apart
   - Anti-alias with `fwidth`.
5. **Background** (ink id 0): paper, ruled lines every 28 CSS px (1.2 px, 60% opacity), margin line at x = 64 CSS px (1.5 px, 70% opacity).
6. **Viewmodel:** where the viewmodel ink id is above 0, or a viewmodel edge exists, use the viewmodel result instead of the world result.

Resize all targets on window resize. Clamp device pixel ratio to 2.

## Meshes (all procedural)

| Thing | How |
|---|---|
| Map | One `BoxGeometry` per box, merged per ink with `mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`. Skip `invisible` boxes |
| Player | Sphere head (12 segments), capsule torso, cylinder limbs (6 radial segments), team ink |
| Player animation | Code-driven: legs swing up to 35 degrees at a rate tied to speed, slide pose, draw pose (string hand pulls back by draw fraction) |
| Bow | `TubeGeometry` along a curved arc (radius 0.02). String is two thin cylinders meeting at the nock, which moves with draw fraction |
| Arrow | Shaft cylinder 0.8 m long, radius 0.012, cone head, two crossed double-sided fletching quads. Scale thickness up to 2× with distance so arrows stay visible |
| Sun | Torus plus ray boxes |
| Paper plane | A few triangles, orbiting slowly |
| Spiral rings | Tori along the north wall top |

## HUD (DOM overlay)

- Fonts from Google Fonts via `<link>`: Gochi Hand, Permanent Marker. Fallback stack: `"Comic Sans MS", "Chalkboard SE", cursive`.
- Crosshair: a hand-drawn circle that shrinks from 18 px to 6 px radius as draw fraction goes from 0 to 1. A tick mark appears at full draw.
- Hit marker: scribbled X. Headshot: red X and a "HEADSHOT" pop.
- Health: scribbled bar bottom left. Team scores top center. Kill feed top right.

## Effects (M6)

| Effect | How |
|---|---|
| Ink splat on headshot | Flat irregular disc, 9 to 14 vertices with seeded random radii, in the victim's team ink |
| Stuck arrows | Client copy stays in the wall for 8 s |
| Arrow trail | Ribbon mesh behind flying arrows, color from the arrow trail cosmetic |
| Damage direction | Scribbled arc at the screen edge toward the attacker |
| Pinned body | On a kill, the body flies along the arrow direction and sticks if a wall is within 3 m, otherwise falls |
| Ink cloud (M7) | Sphere of scribble strokes, drawn as world geometry with ink id 1 |

## Performance rules

- One draw call for the composite pass. Map geometry merged by ink.
- No per-frame allocations. Reuse `Vector3`, `Matrix4` and arrays.
- `renderer.info.render.calls` feeds the F3 overlay.
- Dynamic resolution as described in `TECH.md`.

## Accessibility (M8)

- Settings: field of view, mouse sensitivity, volume, boil on or off (some players find wobbling lines tiring).
- Colorblind option: adds a symbol above each player (circle for Red, triangle for Green) and thickens team outlines.
