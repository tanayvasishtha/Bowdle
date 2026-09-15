# Bowdle rendering

From W1 onward Bowdle is an explorer's Expedition Journal: sepia ink and loose watercolor sketches of lost jungle ruins on aged parchment. There are no ruled notebook lines, margin lines, blue-ballpoint world outlines, or monochrome surfaces.

## Palette and materials

Canonical colors and material ids are defined in `docs/WORLD.md` and implemented by `src/client/render/palette.ts`. The G-buffer alpha channel stores material ids 0–31. `InkMaterial` writes view-space normal XY, tone, and material id; map boxes carry a `material` name. Team 0 uses `teamSun` orange and team 1 uses `teamMoon` indigo. Interactive surfaces use `gold`.

Render-only tuning numbers live in `src/client/render/look.ts`; gameplay numbers remain in `src/shared/constants.ts`.

## Pipeline

Three passes run through `WebGLRenderer` without `EffectComposer`:

1. The world G-buffer stores normal XY, lit tone, material id, and depth.
2. A separate viewmodel G-buffer keeps the bow from clipping into the world.
3. A full-screen composite combines the selected G-buffer with the Expedition Journal treatment.

The composite works in CSS pixels and renders:

- A sky-to-parchment background wash, two map-seeded coffee rings, faint 64 px map grid, paper grain, and a compass rose.
- Material watercolor mixed by tone, four-pixel granulation, darker pigment pooling next to edges, and material-specific outline colors.
- Sepia 45-degree hatching for light materials and cross-hatching for fully hatched materials.
- 1.8 px outlines with 6 fps, 1 px boil; depth fade from 35 m to 120 m and thinner far outlines.
- Animated wave strokes for water and four optional drifting sun shafts.

Resize both targets with the viewport and clamp device pixel ratio to 2.

## Procedural meshes

Map boxes are merged per material. Players use low-poly head/body/limb geometry and their team material. Bows, arrows, ropes, ink clouds, effects, map props, and later jungle props are generated in code; no art files are used. Grapple ropes and ready outlines use gold. Ink clouds use layered dark-foliage scribble spheres.

## Floating notes

Each map may provide up to six short notes with world positions. The renderer projects them into screen space as sepia handwriting and fades them with distance. M8 provides the setting to hide them.

## HUD

The HUD uses handwritten fonts with system fallbacks. It includes a shrinking draw crosshair, hit/headshot feedback, health, Sun/Moon scores, kill feed, scoreboard, death/replay UI, ability cooldown cards, and moment banners. DOM overlays remain readable against both sky and watercolor surfaces.

## Effects

- Headshots leave deterministic irregular team-color splats.
- Wall arrows persist for eight seconds; body arrows persist for three.
- Damage uses a screen-edge scribbled direction arc.
- Near-wall arrow kills can pin a body.
- Ink clouds are layered scribble spheres and never alter arrow collision.

## Performance

- One draw call for the composite pass; static map geometry is merged by material.
- No allocations in frame loops. Reuse vectors, attributes, arrays, and visual instances.
- `renderer.info.render.calls` feeds the debug overlay.
- Props beyond 90 m are hidden and the complete scene stays at or below 150 draw calls and 300,000 triangles.
- Dynamic resolution follows `docs/TECH.md`.

## Accessibility (M8)

Settings cover field of view, mouse sensitivity, volume, boil, floating notes, and colorblind symbols. The colorblind option adds a circle above Sun players and a triangle above Moon players, with thicker team outlines.
