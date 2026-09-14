# Build log

## M2 — Movement

Status: done.

Built:

- Complete gameplay and netcode constant catalog, allocation-free vector helpers, seeded Mulberry32 RNG, angle helpers, and held-button input frames.
- Shared fixed-step player simulation with Quake-style ground/air acceleration, friction, speed cap, jump buffer, coyote time, automatic bunny hopping, crouch, slide boost/steering/cooldown, aim slowdown, and deterministic state.
- Axis-separated swept player collision with stair step-up, floor/ceiling handling, and a standing-clearance check.
- Browser input sampling with pointer lock and first-person fixed-step offline session using interpolation between simulation states.
- Camera crouch and aim-FOV easing, plus speed, grounded, and sliding values in the F3 overlay.

Tests added:

- Nine movement tests: run acceleration, friction stop, jump apex, air strafe cap, slide rules, bunny-hop retention, exact 0.45 m step-up versus 0.5 m refusal, 10,000-substep wall collision, and 600-frame determinism.
- M2 Notebook Page screenshot at `test-results/qa/m2/notebook-movement.png`.

QA:

- `npm run check`: passed with 20 tests.
- `npm run e2e`: 2 passed.
- `npm run size`: client JavaScript 138 KB gzipped, 900 KB budget.
- Break check: lowering `STEP_HEIGHT` to 0.3 made the independent 0.45 m step test fail at the obstacle boundary; restoring 0.45 returned the suite to green.

Deviation: none.

Verify by hand:

- Confirm running settles near 8 m/s and sliding peaks near 10.5 m/s.
- Confirm the book stack is jumpable, the pencil case is not, and both authored staircases walk cleanly.
- Confirm chained hops retain momentum and wall contact never sticks or penetrates.
- Confirm crouch height and aim FOV transitions feel quick without snapping.

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
