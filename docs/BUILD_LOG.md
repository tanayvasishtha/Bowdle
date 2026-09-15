# Build log

## M4b — Online combat and match loop

Status: done.

Built:

- Server-authoritative bow releases, swept arrow flight, dagger hits, head/body damage, team-damage rejection, regeneration, deaths, assists, kills, and scoring.
- Snapshot-timeline lag compensation for arrow and dagger target poses, bounded to 250 ms and driven by the client input stamps.
- Respawn countdowns, safest-spawn selection, fire/stab protection cancellation, score/time endings, MVP result messages, and same-room match restarts.
- Zod validation for name, kill, hit-confirm, damage, match-end, and future arrow-clash messages.
- Immediate local arrow prediction with replay suppression, seamless authoritative correlation, foreign arrows, and retained wall-impact visuals.
- In-match team score and timer, kill feed, hit/headshot marker, directional damage cue, Tab scoreboard, death countdown, and result screen.

Tests added:

- Match scoring, score-limit, timed draw, safest-spawn respawn, and protection tests.
- Server arrow creation, 30 m full-draw headshot kill/score, friendly-damage rejection, and score-limit integration tests.
- Two-browser movement plus ballistic aim/full-draw kill test; both clients must show the headshot feed within three seconds.
- Combat screenshots at `test-results/qa/m4b/`.

QA:

- `npm run check`: passed with 43 tests.
- `npm run e2e`: 4 passed.
- `npm run size`: client JavaScript 233 KB gzipped, 900 KB budget.
- Visual inspection: the combat scene, team score, match timer, and shared headshot feed render cleanly over the notebook arena.
- Break check: manual only. Replacing rewound poses with live poses is observable under induced latency, not in the zero-latency browser harness; the required comparison remains in Verify below.

Installed API notes:

- `clock.elapsedTime` is the server's milliseconds-since-room-start timeline reconstructed by client `room.clock.serverNow()`; it stamps arrows and all absolute deadlines.
- Rewind uses `allowRewindState`, `attachAll(..., { mode: "snapshot" })`, and allocation-free `lastSeenBy(...).value(...)` reads from the installed declarations.
- Arrow simulation-only `ageMs` and `stuck` fields use the installed schema builder's `.noSync()` modifier and are never sent over the wire.

Deviation:

- `?test` joins use a clear symmetric firing lane so the required deterministic two-page combat check is not defeated by the production map's intentional spawn sightline blockers. Normal joins always use authored team spawns.
- The dedicated browser-verification command was unavailable on this host. Playwright's Chrome-backed render assertions, error capture, and saved screenshots covered the live browser check without changing dependencies.

Verify by hand:

- Confirm a full-draw headshot kills, two full-draw body shots kill, and arrows leave the bow immediately without a confirmation jump.
- Confirm teammate hits do no damage, Tab shows all player stats, death respawns after three seconds, and a locally lowered score limit produces an end screen followed by a fresh match.
- Run the documented 150 ms latency test against a strafing target and confirm rewound shots land where aimed; temporarily compare live target poses, then restore rewind.

## M4a — Online movement

Status: done.

Built:

- Complete Colyseus schema state for players, inputs, arrows, match fields, and future ability/cosmetic fields.
- Plain authoritative movement tick that consumes buffered frames one at a time through the shared simulation.
- `tdm` room with sanitized reliable inputs, repeated-idle policy, 30 Hz fixed timestep with two physics substeps, warmup/live phases, team assignment, and 15-second reconnection.
- Client join flow, fixed-rate input sending, local rollback reconciliation, 100 ms remote interpolation, angle interpolation, and remote doodle-player rendering.
- Temporary Practice/Play menu and online test hooks.

Tests added:

- Schema-to-`PlayerSim` compatibility test.
- Server join/team test, 90-wire-frame parity test at explicit 1e-6 tolerance, and reconnect identity test.
- Two-browser shared movement test and screenshots at `test-results/qa/m4a/`.

QA:

- `npm run check`: passed with 36 tests.
- `npm run e2e`: 4 passed.
- `npm run size`: client JavaScript 208 KB gzipped, 900 KB budget.
- Break check: manual only. Multiplying the reconciler's local forward input is a visual rubber-band/debug-panel check rather than a stable assertion; it remains in Verify below.

Installed API notes:

- The installed client room resolves before the `onJoin` player addition is necessarily decoded. The join flow waits on `Callbacks.onAdd("players")` before constructing the reconciler.
- The input schema is passed explicitly to `room.input({ type: PlayerInput, mode: "reliable" })`; the installed API also supports reflected discovery.
- The installed `Predict` reconciler observes `input.send()` and receives `context.isReplay`/`context.reckonTime`; no separate local step call is needed.

Verify by hand:

- Open two windows and confirm self movement feels identical to Practice while the remote player stays smooth.
- Enable the prediction debug panel and confirm the reconciler remains matched.
- Temporarily multiply local `moveZ` by 1.5 and confirm visible correction plus divergence reporting, then revert.

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
