# Build log

## M1 — Doodle renderer and map data

Status: done.

Built:

- Pure shared map types, `mirrorX`, stair generation, and the Notebook Page shell, cover, stairs, bridge, spawns, and decor.
- Map validation rules 1–5 and 9: box dimensions, bounds, mirror symmetry, spawn clearance and support, stair height, and opposing spawn sightlines.
- Three-pass WebGL2 renderer with world and viewmodel G-buffers, depth textures, full-screen composite, paper grain, ruled paper, margin line, boiling edges, normal/depth outlines, and stepped cross-hatching.
- Static map geometry merged by ink, procedural sun, paper planes, spiral rings, and bow viewmodel.
- Free-fly inspection camera, pointer lock, F3 frame-rate/draw-call overlay, and same-frame pixel snapshot hook.
- Optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` support for hosts with a system browser but no downloaded Playwright runtime.

Tests added:

- Eight map validation tests, including one broken map for each implemented rule.
- Browser render test for paper and ink coverage with a screenshot at `test-results/qa/m1/notebook-map.png`.

QA:

- `npm run check`: passed.
- `npm run e2e`: 2 passed.
- `npm run size`: client JavaScript 136 KB gzipped, 900 KB budget.
- Break check: forcing the composite output to paper made the render test fail with ink fraction 0; restoring the shader returned the suite to green.

Deviation:

- The spawn-cover box was widened from z -3…3 to -5…5 and raised from 1.2 m to 2 m. The documented box dimensions left direct eye-height sightlines between opposing spawns; this is the smallest single symmetric cover adjustment that makes validation rule 9 pass without adding geometry.

Verify by hand:

- Confirm the edge boil reads as a hand-redrawn wobble rather than camera shake.
- Confirm hatching is darkest below the bridge and remains clear during movement.
- Confirm ruled lines and the red margin appear only in empty background.
- Confirm the F3 overlay remains below 40 draw calls from useful map viewpoints.
