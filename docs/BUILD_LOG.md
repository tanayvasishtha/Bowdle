# Build log

## W1 — Expedition Journal look

Status: done.

Built:

- Replaced the ruled notebook presentation with a sky-to-parchment Expedition Journal composite: paper grain, faint map grid, seeded coffee rings, compass rose, watercolor granulation and edge pooling, sepia hatching/outlines, depth fade, water strokes, boil, and optional sun shafts.
- Replaced world ink ids with the full material-id table and migrated existing arena/range surfaces to earth, stone, carved stone, wood, foliage, canvas, rope, and gold while preserving collider layout.
- Renamed all runtime team data and labels to Sun and Moon while keeping team indices 0 and 1.
- Added gold grapple surfaces, orange/indigo team materials, screen-projected sepia notes, journal-styled HUD/replay/practice overlays, and nearest-palette screenshot classification including explicit legacy colors.
- Added `src/client/render/look.ts` as the canonical home for render-only tuning and updated the project instructions and world/render/map/netcode documentation.

Tests added or updated:

- Browser palette proof for combined parchment/sky, material washes, sepia, and near-zero legacy ruled/blue colors.
- Journal-look browser coverage for the range and an online match.
- Existing schema, map, match, server, and browser assertions migrated to Sun/Moon and material names without reducing coverage.

QA:

- `npm run check`: passed with 61 tests.
- `npm run e2e`: 7 passed.
- `npm run size`: client JavaScript 241 KB gzipped, 900 KB budget.
- Break check: forcing every composite pixel to the legacy paper color reduced material-wash coverage to zero and failed the new render test; restoring the journal composite returned it to green.
- Screenshots: `test-results/qa/w1/journal-map.png`, `journal-range.png`, and `journal-online.png`.
- Visual inspection: warm washes, dark pooled edges, sepia hatching, compass/grid details, Sun/Moon HUD labels, and gold interactions read clearly; no ruled lines, margin line, or blue-ballpoint world ink remains.

Deviation:

- The pre-existing Practice hit marker could clear before a busy browser runner observed it. Its visible animation now fades while retaining semantic text until the next hit, removing the timing race without sleeps or retries.

Verify by hand:

- Explore the current arena, practice trail, and an online match at 1080p; confirm the wash feels like translucent pigment rather than flat tint and distant geometry fades naturally into the page.
- Confirm Sun orange and Moon indigo players remain instantly distinguishable against every current material.
- Toggle through bright and dark viewpoints and judge whether the subtle grid, stains, compass, and notes support navigation without becoming visual noise.

## M7 — Abilities

Status: done.

Built:

- Deterministic grapple input, solid-aware grapple-box ray attachment, range and cooldown enforcement, pull acceleration, maximum pull speed, and release on jump, second press, anchor distance, or maximum duration.
- Grapple state remains entirely in `PlayerState`, so authoritative simulation and rollback replay share the same anchor, timer, velocity, and release behavior.
- Authoritative grapple and ink projectiles with distinct gravity, zero combat damage, ink-cloud creation on world impact, synchronized expiry, and isolation from normal arrow clashes.
- Ink clouds block computer-controlled sight rays while remaining transparent to arrow collision.
- Computer-controlled players throw ink while retreating and select grapple shortcuts when a reachable grapple surface materially shortens their current route.
- Immediate special-projectile prediction, orange scribbled grapple ropes and target outlines, layered scribble-sphere ink clouds, and paper-card cooldown indicators for E and Q.

Tests added:

- Grapple attachment tests for tag and range plus every release condition, cooldowns, and ink event creation.
- Center-ray ink-cloud visibility blocker proof and computer-controlled sight/retreat behavior tests.
- Sixty-frame authoritative-versus-shared grapple position comparison with explicit replay-state protection.
- Server ink impact/cloud creation test.
- Two-client browser ability flow with screenshots at `test-results/qa/m7/grapple-rope.png` and `test-results/qa/m7/ink-cloud.png`.

QA:

- `npm run check`: passed with 61 tests.
- `npm run e2e`: 6 passed.
- `npm run size`: client JavaScript 239 KB gzipped, 900 KB budget.
- Break check: removing `grappleMs` from `PlayerState` failed the named 60-frame grapple test with missing replay state; restoring the field returned it to green.
- Visual inspection: grapple-ready orange outlines remain legible across the arena, the rope reads clearly against paper and geometry, cooldown states are glanceable, and the layered ink cloud visibly occludes the center lane.

Deviation: none.

Verify by hand:

- Grapple from ground level to the bridge and perch; confirm the pull feels fast but steerable and a jump release preserves momentum with a useful upward fling.
- Play online under latency and confirm repeated grapples never produce position corrections or rope snaps.
- Throw ink between an opponent and a computer-controlled player; confirm vision is blocked while arrows continue through the cloud.

## M6 — Highlight moments

Status: done.

Built:

- A preallocated three-second, 30 Hz transform history for eight players and all possible arrows, with a 1.2-second arrow-follow replay at 0.35x speed and a skip control.
- Post-replay killer spectating, hidden first-person bow during replay, and automatic return on respawn.
- Practice long-shot picture-in-picture using the shot's recorded ballistic trajectory at replay speed.
- Seeded 9–14-point team-ink headshot splats, near-wall body pinning, three-second body arrows, eight-second wall arrows, and screen-edge directional damage arcs.
- Swept segment-to-segment arrow clash detection every physics substep, global Robin Hood messages, deferred reward records, banner, and procedural paper-tear sound.
- Headshot and 35 m long-shot banners plus a no-op platform happy-time boundary for future publishing integrations.

Tests added:

- Segment distance tests for crossing, parallel, and endpoint-separated paths.
- Server proof that two opposing head-on arrows both disappear and create reward records.
- Online arrow-cam visibility assertion and screenshot at `test-results/qa/m6/arrow-cam.png`.
- Practice trajectory replay assertion and screenshot at `test-results/qa/m6/practice-replay.png`.

QA:

- `npm run check`: passed with 53 tests.
- `npm run e2e`: 5 passed.
- `npm run size`: client JavaScript 237 KB gzipped, 900 KB budget.
- Break check: changing the clash distance threshold to zero left both arrows alive and failed the head-on server test; restoring twice the arrow radius returned it to green.
- Visual inspection: the online replay cleanly removes the viewmodel, frames the splatted/pinned victim, keeps the headshot banner readable, and exposes the skip control. The practice inset shows the captured arc on ruled paper.

Deviation: none.

Verify by hand:

- Die to a long-range arrow and confirm the slow flight remains readable before the view settles on the killer; verify skip exits cleanly.
- Confirm a headshot leaves a team-color splat, a near-wall arrow kill pins the body, and damage arcs point toward the attacker.
- Capture a replay clip and judge whether the camera spacing and timing feel worth sharing; tune only if the motion feels cramped at the chosen capture resolution.

## M5 — Computer-controlled teams

Status: done.

Built:

- A 38-node mirrored Notebook Page navigation graph covering every spawn, both lanes, cover flanks, bridge stairs/top, and perch stairs/top.
- Map validation rules 6–8: graph connectivity, capsule-aware standing walk sweeps with step-up, and a visible waypoint within three metres of every spawn.
- A* routing, waypoint following, jump links, and seeded slide decisions on long walk links.
- Three-iteration ballistic lead with gravity and target velocity, plus seeded easy/normal/hard aim error.
- Deterministic roam, engage, and low-health retreat states with solid-box sight checks, 250 ms reaction time, 450–650 ms draw timing, and combat strafing.
- Automatic 4v4 team filling. A joining person replaces a computer-controlled slot on the less-populated human team; a departing person is replaced while preserving stats.
- Scenic patrol routing mixed with pressure toward enemy spawns so opponents traverse authored vertical routes while continuing to find fights.

Tests added:

- Broken-map proofs for disconnected graphs, blocked walk links, and spawns without nearby visible nodes.
- A* routes between every pair of team spawns.
- At least 90 of 100 seeded 30 m lead shots against a target moving at 6 m/s.
- Server join proof for eight total players and balanced 4v4 teams.
- Eight-player, timer-free 7-minute match simulation that produces kills and reaches the end phase.
- Solo browser match proof with all slots visible on the scoreboard and screenshot at `test-results/qa/m5/full-match.png`.

QA:

- `npm run check`: passed with 49 tests.
- `npm run e2e`: 5 passed.
- `npm run size`: client JavaScript 234 KB gzipped, 900 KB budget.
- Break check: setting lead refinement to zero reduced the accuracy result from passing to 0/100; restoring three iterations returned it to green.
- Visual inspection: the warmup scene presents a readable full 4v4 roster over the procedural arena.

Deviation:

- The authored navigation graph has 38 nodes rather than an exact 40; the map asks for approximately 40, and all named areas plus every validation requirement are covered.
- Deterministic two-page duel rooms lock after their pair joins so a later normal browser check cannot inherit that stripped-down test room.

Verify by hand:

- Play alone and confirm computer-controlled players traverse both stair routes, the bridge, and the perch.
- Confirm no opponent remains caught on cover for more than three seconds.
- Confirm normal accuracy pressures a moving player without becoming oppressive and that a complete match ends cleanly.

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
