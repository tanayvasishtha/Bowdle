# Build log

## M3 — Bow, arrows, dagger, and Practice Range

Status: done.

Built:

- Shared bow timing, cancel/release edge detection, cooldowns, draw fraction, arrow speed, and damage curves.
- Closed-form projectile integration with swept-sphere world collision, player head/body hitboxes, headshot multiplier, dagger arc/range/backstab checks, damage, death, and regeneration.
- Practice Range geometry with five standing targets, two rail targets, slide bars, and step-up course.
- Playable practice session with arrows, wall/body sticking, target damage and respawn, melee, draw crosshair, hit/headshot feedback, and a procedural bow viewmodel.
- Procedural WebAudio draw, release, impact, headshot, and dagger sounds with delayed audio-context creation.
- Deterministic `fireAt` browser hook using the production ballistic and hitbox functions.

Tests added:

- Bow boundary, early-release, cooldown, speed, and damage tests.
- Ballistic position, 95 m/s thin-wall sweep, head/body priority, and crouched-hitbox tests.
- Dagger range, arc, and backstab tests.
- Practice Range validation and browser full-draw headshot test.
- Screenshot at `test-results/qa/m3/practice-range.png`.

QA:

- `npm run check`: passed with 32 tests.
- `npm run e2e`: 3 passed.
- `npm run size`: client JavaScript 142 KB gzipped, 900 KB budget.
- Break check: replacing the swept world collision with an endpoint test made the 95 m/s arrow pass through the 0.1 m wall and fail its test; restoring the sweep returned it to green.

Deviation: none.

Verify by hand:

- Confirm full-draw drop remains readable at 30 m and tap shots drop substantially more.
- Confirm the 40 m moving target requires visible lead.
- Confirm front dagger hits need two strikes and a rear strike kills.
- Confirm stuck arrows remain for about 8 seconds and procedural sounds feel crisp rather than harsh.

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

- The north/south sharpener pair was joined at z 0 and raised from 1.6 m to 2 m. The documented dimensions left direct eye-height sightlines between opposing spawns; this symmetric mid-lane adjustment satisfies validation rule 9 while keeping every spawn's forward lane open.

Verify by hand:

- Confirm the edge boil reads as a hand-redrawn wobble rather than camera shake.
- Confirm hatching is darkest below the bridge and remains clear during movement.
- Confirm ruled lines and the red margin appear only in empty background.
- Confirm the F3 overlay remains below 40 draw calls from useful map viewpoints.
