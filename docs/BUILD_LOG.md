# Build log

## M12: Portals and launch features

Status: done.

Built:

- Platform layer in `src/client/platform`: one SDK interface with web (no-op), Poki and CrazyGames implementations. Scripts load at boot with a timeout; a blocked or failing SDK falls back to no-ops. Gameplay start and stop are reported only on real changes (match start, pause menu, match end) and in the order they happen. Loading finished is reported once.
- Ad breaks before "Play again" on portal builds. Every AudioContext is suspended and input is paused for the whole ad, then restored.
- Portal policy: portal builds hide purchases, Discord and Google sign-in, and Share on X. The web build shows no ads.
- `npm run build:poki`, `npm run build:crazygames` and `npm run build:portals` (builds both and checks relative asset paths, legal pages, the game server URL and the SDK script).
- Save clip on the end screen: two overlapping MediaRecorder segments keep 8 to 16 seconds of the game view ready; the file downloads as WebM and recording continues.
- Share on X link on the end screen (web build only).
- Privacy notice and terms of play at `/privacy.html` and `/terms.html`, linked from the menu on every build.
- Fixed a matchmaking flake: test rooms are now also filtered by map, so a leftover test room on another map is never joined.

Verified: `npm run check`, full Playwright suite (launch spec added: clip download, share link, legal pages), `npm run build:portals`, and `npm run smoke` (portal-origin CORS preflight included). Real portal ads can only be checked inside each portal's test tool.

## M11: Cosmetics and shop

Status: done.

Built:

- Catalog of 24 cosmetics plus a free default in each of four categories (bows, arrow trails, outfits, kill effects): 16 for Ink, 8 paid. No item uses a team color; shirts and sleeves always show the crew.
- Rig cosmetics on the C1 skeleton: six headgear types, six accessories, hat and trim paints, five bow ornaments. Rig parts now merge by paint instead of by slot, so an explorer still costs 5 to 8 draw calls and a wood bow costs nothing extra.
- First-person bow skins (limb paint, grip paint, ornaments).
- Arrow trails as one crossed ribbon per arrow (dots, dashes, zigzag, ribbon) that follow the live arrow head and shrink away once it sticks. Kill effects as one instanced burst (leaves, feathers, stars, sparks, wings, rubble) shown on every kill by the owner; the default keeps the headshot ink splat.
- Locker scene (`?scene=locker`, menu button): rotating explorer, Sun and Moon toggle, live preview of any item including trails and effects, Ink purchases, equipping, and paid purchases through Xsolla Pay Station.
- Server: inventory, orders and loadout columns (migration 2). Ink purchases are one transaction. Loadouts are checked against the inventory when saved, when read and when a player joins a room; what the client claims is ignored. A bot that takes over a leaving player drops their cosmetics.
- Xsolla: Store API payment token with merchant Basic auth, sandbox flag, signed webhook with user validation, idempotent order paid and refund handling. Money purchases need a linked Discord or Google account. The paid shop is off unless all Xsolla values are set, and portal builds never show it.
- Practice Camp uses the equipped bow and trail.
- A test-only Ink grant route, enabled only with `BOWDLE_DEV_GRANTS=1` outside production, for the browser test.

Verified: `npm run check` (169 tests), full Playwright suite (25 passed, locker spec added), locker screenshots in `test-results/qa/m11`. A real Xsolla sandbox purchase still needs Tanay's Publisher Account (see ECONOMY.md).

## M10: Accounts and progression

Status: done.

Built:

- `GameDatabase` on a small SQL layer: PGlite in dev and tests (in memory unless `PGLITE_DIR` is set), Postgres through postgres.js when `DATABASE_URL` is set. Numbered migrations in `src/server/db/migrations.ts`.
- Anonymous accounts created on first Play or first Profile visit. Tokens are `id.secret`, one per device, stored only as SHA-256 hashes. Guest sign-up is rate limited per IP.
- Discord and Google sign-in with the OAuth code flow. A provider appears only when its client id, secret and `PUBLIC_URL` are set. State values are single use and expire after 10 minutes. New-device tokens come back in the URL fragment so they never reach access logs.
- Progression in `src/shared/progression.ts`: level n takes 500 x n XP, max level 100. A match gives 100 XP, 50 per kill, 25 per assist and 200 for a win, plus 10 Ink, 10 for a win and 1 per kill up to 10.
- The room grants rewards once per match id, even if the end screen fires twice, and sends each signed-in player a `rewards` message shown on the end screen.
- Quarterly seasons (`2026-S3`) with a kills leaderboard.
- Menu Profile panel (level bar, Ink, season stats, rename, provider linking, two-step account deletion) and a Leaderboard panel. Deleting an account removes its tokens, rewards and season rows.
- `/api` routes: `POST /auth/guest`, `GET /auth/providers`, `POST /auth/:provider/start`, `GET /auth/:provider/callback`, `GET|PATCH|DELETE /profile`, `GET /leaderboard`.

Verified: `npm run check`, the full Playwright suite (accounts spec added), and `npm run smoke` (guest and profile API included). Not yet run against a real Postgres server: the SQL is standard and PGlite runs the same Postgres engine, but run `npm run smoke` once with `DATABASE_URL` set before launch.

## W8: World finish

Status: done.

Built:

- Scenery rules in `src/shared/maps/scenery.ts`: tall props in the arena must stand on a collider, and each map declares a landmark that both spawn areas can see. Both run as unit tests for every launch map and Practice Camp.
- Invisible colliders under every tall prop that lacked one: Sun Temple camp trees and tents, Lost River bank trees, the Practice Camp tent. The Sun Temple tree that hung over the ravine moved to solid ground.
- Sun Temple: pillar props on all 20 pillars, braziers by the altar stairs, stone heads on the tier corners and vine walls on the vine climbs. The z = -8 firing lane stays open.
- Canopy Village: supply tents behind each spawn and lanterns on the decks.
- Lost River: serpent stone heads moved out of the aqueduct stair and the south walk link, now beside each spawn.
- Tree lines start 2.8 m outside the play bounds so no trunk stands inside the arena.
- Composite pass: a two-layer canopy horizon with haze that sits on the true horizon for the camera pitch and pans with yaw, drifting birds, and outline ink weighted by depth gap.

Verified: `npm run check` (142 tests), full Playwright suite (21 passed), screenshots in `test-results/qa/w7`.

## C1: Characters

Status: done.

Built:

- Two explorer crews on one silhouette and hitbox: Sun (orange shirt, pith helmet, gold sash, map tube) and Moon (indigo shirt, knit cap, scarf, lantern). Straw dummies for Practice Camp targets.
- A skinned rig with 16 bones, merged by material slot so each character costs 6 to 7 draw calls. The bowstring stretches between the grip and nock bones.
- A pure pose function with ten leg states and six upper body states, two-bone leg IK, speed-scaled strides, a side-on draw with look-pitch aim, an upright bow carry, dagger stabs, zip line hanging and knocked-out poses. Hips shift so the drawn head always sits on the head hitbox.
- First-person viewmodel with team sleeves, hands, a string that follows the draw, a nocked arrow and a dagger thrust.
- Online and Practice Camp sessions feed motion for every player each frame, including wading from water volumes.
- The ink shader supports skinned meshes.
- Crew lineup scene at ?scene=characters.
- Snapshot now reports team hue coverage, because blended team washes fall between palette entries.
- docs/CHARACTERS.md.

Tests added:

- Pose tests: state selection and priority, head on hitbox for every living pose and action, feet reach, stride opposition, draw pull, aim follows pitch, upright carry, dagger visibility, allocation-free output.
- Rig tests: draw calls per crew, rig head matches the pose math, world placement, motion from a player simulation, stab timing.
- tests/e2e/characters.spec.ts: lineup screenshot, draw call budget, close-ups confirming each crew's color.

QA:

- npm run check: passed with 127 tests.
- npm run e2e: 21 passed.
- npm run size: client JavaScript 265 KB gzipped, 900 KB budget.
- Screenshots in test-results/qa/c1/.
- Break check: not run for this milestone.

Verify by hand:

- Watch a bot match from a distance: running, sliding, drawing and stabbing should all read at a glance.
- Check that aiming at the drawn head lands headshots in every stance.

## M9: Deploy and performance

Status: done.

Built:

- One production process: Express serves dist/client, Colyseus serves the game WebSocket on the same origin, GET /health reports readiness.
- Server metrics logged as one JSON line every 10 seconds with room count, player count and average tick time.
- Dynamic resolution scaling between 100 and 60 percent render scale.
- Dockerfile on node:24-slim and docs/DEPLOY.md for a single Render web service with HTTPS, custom domain and rollback.
- npm run smoke: starts the production server, checks /health, the served client page and a WebSocket join on tdm, then shuts down.

QA:

- npm run check: passed with 112 tests.
- npm run e2e: 20 passed.
- npm run smoke: health, client page and WebSocket join all passed.
- npm run size: client JavaScript 258 KB gzipped, 900 KB budget.
- Draw calls at most 150 and triangles at most 300000 on every launch map, now measured across the whole frame (see W7).

Deviation:

- Docker is not installed on the build machine, so docker build was not run here. The smoke script covers the same checks against a normal checkout.
- Server tick time under load was not measured here. The metrics log reports it in production, and DEPLOY.md lists the 3 ms target.

Verify by hand:

- Run docker build and docker run from DEPLOY.md on a machine with Docker.
- Deploy, then play from two networks and run the 150 ms latency procedure from NETCODE.md.

## W7: Scenery density and the instancing fix

Status: done.

Built:

- Seeded scatter helper in src/shared/maps/scatter.ts that places props by area and density while avoiding colliders, ramps, water, zip lines, boulder paths and spawns.
- Jungle dressing helper in src/shared/maps/dressing.ts: a tree line outside the play area, undergrowth inside it, ground patches that break up the flat floor, and grass that fills every tall grass volume. Everything mirrors across x = 0, so map validation still passes.
- Sun Temple, Canopy Village, Lost River and Practice Camp now carry 250 to 500 props each instead of about 12. Boundary slabs became invisible colliders standing behind a real tree line.
- Ground patches are decoration only. Without the solid tag they never collide, never slow the simulation and never block the boulder path.
- Tall grass volumes are no longer drawn as green boxes. The volume still drives stealth and bot sight; the grass itself is drawn as props.
- Ink material: per surface color variation and contact shading where geometry meets the ground.
- A pointer lock helper that swallows the browser rejection when a page cannot capture the mouse.

Fixed:

- Instancing: the ink vertex shader ignored instanceMatrix, so every instanced prop rendered stacked at the world origin. That is why the maps looked empty while a blob of trees sat on the temple. Props now render where the map places them.
- Draw call counting: renderer info reset on every pass, so stats() only reported the final composite pass (1 call, 1 triangle) and the performance budgets could never fail. Info now accumulates across the frame and the budgets are real.

Tests added:

- Scatter and dressing unit tests: determinism, blocker avoidance, spacing, scale ranges, mirroring, and patches flush with the ground.
- A shader test that fails if the instance matrix is dropped again.
- tests/e2e/world-density.spec.ts: per map background at most 45 percent, washes at least 25 percent, ink at least 3 percent, draw calls at most 150, triangles at most 300000, plus at least 120 props and no visible boundary slab on every launch map.

QA:

- npm run check: passed with 112 tests.
- npm run e2e: 20 passed.
- npm run size: client JavaScript 258 KB gzipped, 900 KB budget.
- Screenshots in test-results/qa/w7/.
- Break check: not run for this milestone.

Deviation:

- Silhouette weight by depth gap, the horizon haze band and drifting birds from the W7 plan are not built. The tree line and the existing depth fade already carry the horizon, so these are queued for a later polish pass.
- Playwright on this machine needs PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH pointing at the installed Chrome, because the browser build the config expects is not downloaded.

Verify by hand:

- Walk each map and confirm no prop hides a lane you can shoot through.
- Stand in tall grass and confirm it reads as cover from outside and stays see-through from inside.
- Compare the W6 and W7 screenshots: the difference should be obvious at a glance.

## M8: Menus, onboarding and settings

Status: done.

Built:

- Replaced the temporary launch page with a journal-style main menu for Play, Practice, and Settings, plus first-visit explorer naming stored locally and validated against a built-in reserved/unfriendly word list on both client and server.
- Added persistent mouse sensitivity, 80–110 field of view, master volume, animated ink boil, floating notes, team symbols, and complete keyboard/mouse action rebinding. Saved bindings drive gameplay, scoreboard, menu, and development overlay input.
- Added circle and triangle team markers, thicker high-contrast symbol strokes, live FOV changes, note visibility, volume changes, and an option to freeze the ink boil.
- Added a skippable first-visit Practice Camp lesson that advances through movement, jumping, sliding, shooting the 10-metre target, and stabbing a target.
- Added the match result card with personal kills, deaths, best-shot distance, MVP, a large same-room Play Again button, and a synchronized next-map vote. A unique vote winner overrides rotation; ties preserve the documented rotation.
- Added a retryable connection screen, a friendly keyboard-and-mouse requirement screen for touch-only devices, and an Esc menu with Resume, Settings, and Leave Match.
- Isolated ordinary and deterministic browser rooms with the installed Colyseus matchmaking filter so disconnected test sessions cannot affect live matchmaking.

Tests added or updated:

- Shared name validation tests for valid, reserved, unfriendly, empty, and oversized names.
- Server vote coverage for a clear winner and tied-vote rotation fallback.
- Browser journeys from the menu into Practice Camp, from first-time name entry into the online HUD and Esc menu, and through an FOV change that survives reload.
- The online movement/combat journey now verifies that both replicated players have physically settled before its server-authoritative headshot.
- Screenshots are in `test-results/qa/m8/` and are intentionally untracked.

QA:

- `npm run check`: passed with 96 tests.
- `npm run e2e`: 15 passed.
- `npm run size`: client JavaScript 256 KB gzipped, 900 KB budget.
- The milestone defines no automated break-it-on-purpose check.
- Diff review: no dependency changes, forbidden imports, unsafe simulation randomness, weak typing, per-frame or per-tick allocations, or reduced tests were introduced. New gameplay limits remain in `src/shared/constants.ts`.

Deviation: none. The installed Colyseus room definition exposes the documented `filterBy` matchmaking API and it is used for browser-room isolation.

Verify by hand:

- Give the link to a first-time player and watch them reach their first Practice Camp elimination without coaching; note and fix any unclear prompt or station.
- Try every remapped action, including mouse draw/aim, scoreboard, Esc, and the development F3 overlay; reload and confirm the choices persist.
- Play through a match end, vote with multiple clients, press Play Again, and confirm all clients remain in the same room and load the winning map.
- Inspect team symbols on mixed terrain and verify Sun and Moon remain distinguishable without relying on color.
- Open on a touch-only phone or tablet and confirm the desktop message replaces the game controls.

## W6: Lost River, Practice Camp and rotation

Status: done.

Built:

- Added Lost River with a timed flood, split aqueduct and climb routes, traversable seaplane wreck, two log bridges, waterfall cave, reed cover, ruined gates, journal props and field notes, plus a connected waypoint network across six river routes.
- Added Practice Camp with fixed and moving bow targets, a watchtower zip line, grapple wall, slide logs, boulder lane and safe alcove, creek crossing, and a moving opponent confined to the tall-grass stealth lane.
- Added the map registry and deterministic Sun Temple → Canopy Village → Lost River match rotation. Synchronized map ids now rebuild the client world and ambience between matches.
- Removed the retired prototype arena and target lane, including their source files, routes, tests, and documentation references.
- Added close-range dagger decisions to computer-controlled combat so full matches do not stall when opponents meet behind cover.

Tests added or updated:

- Registry rotation across three match restarts, Lost River flood slowdown, and a full eight-player Lost River simulation. Together with the existing Sun Temple and Canopy Village simulations, every launch map now reaches the end phase under computer control.
- Practice Camp headshot coverage and a browser join on each launch map with zero console errors and a 150-draw-call ceiling.
- Existing online replication, combat, grapple, and ink-cloud journeys now run on a forced launch map and remain deterministic after map rotation.
- Screenshots for every touched scene are in `test-results/qa/w6/` and are intentionally untracked.

QA:

- `npm run check`: passed with 92 tests.
- `npm run e2e`: 12 passed.
- `npm run size`: client JavaScript 252 KB gzipped, 900 KB budget.
- The milestone defines no automated break-it-on-purpose check.
- Diff review: no dependency changes, forbidden imports, unsafe simulation randomness, weak typing, per-frame or per-tick allocations, or reduced tests were introduced. New gameplay tuning is centralized in `src/shared/constants.ts`.

Deviation:

- Aqueduct stairs and broken seaplane wings use the shared ramp-wedge collision primitive instead of individual step or curved-mesh collisions. This preserves smooth authoritative traversal and the documented routes without introducing a second collision model.

Verify by hand:

- Play one complete match on Sun Temple, Canopy Village, and Lost River; confirm the next map appears in the documented order and that the world rebuild is clean.
- Enter the Lost River during a flood warning and confirm the rising water gives enough time to choose a bridge, aqueduct, wreck, or cave route before the slowdown becomes dangerous.
- Try every Practice Camp station without instructions and confirm each mechanic is discoverable, including the moving opponent inside the stealth grass.
- Check each spawn for an obvious landmark, three useful exits, regular cover, and no enemy sightline into the protected area.
- Confirm a stable 60 frames per second at 1080p on the target integrated-graphics laptop.

## W5: Canopy Village

Status: done.

Built:

- Added the mirrored three-level Canopy Village arena with the great tree, low and high ring decks, climbable central runs capped at 20 degrees, west and satellite tree decks, connecting bridges, four directional zip lines, a shallow stream, north waterfall, tall-grass retreat pockets, fallen logs, field notes, and sun-shaft lighting.
- Authored a connected waypoint network across the ground, low decks, high decks, all spawns, grass pockets, zip routes, drops, jumps, and grapple shortcuts. Every required deck is reachable on foot.
- Added automatic nearby zip attachment and zip-link traversal to computer-controlled navigation, plus team-side grass selection while retreating.
- Added `/?scene=map&map=canopy` with repeatable test-camera views.

Tests added:

- Canopy map validation for mirrored geometry, supported ramp ends, 20-degree central climbs, grounded volumes, rope clearance, hidden spawns, complete graph connectivity, valid walk sweeps, and foot access to every required deck.
- Full eight-player authoritative match simulation through the end phase, with at least three zip rides and a watchdog rejecting any living unprotected player stationary for more than three seconds.
- A focused nearby-zip navigation test.
- Four browser views (spawn tree, high ring, midway along a zip line, and inside floor grass) with zero console errors and a 150-draw-call ceiling. Screenshots are in `test-results/qa/w5/`.

QA:

- `npm run check`: passed with 89 tests.
- `npm run e2e`: 11 passed.
- `npm run size`: client JavaScript 251 KB gzipped, 900 KB budget.
- Diff review: no dependency changes, unsafe simulation randomness, weak typing, forbidden imports, per-tick allocations, or reduced tests were introduced.

Deviation:

- The central spiral is represented by mirrored straight timber runs because the shared collision kit supports axis-aligned ramp wedges rather than curved surfaces. Both runs stay within the specified 20-degree limit and preserve the full ground-to-high-ring walking route.
- The west tree uses compact ramp runs rather than discrete stair boxes, preserving smooth authoritative movement and the specified deck elevations within the dense tree footprint.

Verify by hand:

- Fight from the ground, each low deck, and the high ring; confirm every level has useful sightlines and at least three approaches to the power position.
- Walk from either spawn to the high ring without grappling and confirm each ramp/deck transition feels smooth.
- Draw and fire while riding each zip line, then jump off midway and confirm momentum feels readable.
- Crouch inside both team-side grass pockets, ambush an approaching opponent, and confirm retreating opponents deliberately enter cover.
- Check every spawn view for a clear landmark and confirm no opposing lane sees directly into a spawn.

## W4: Sun Temple

Status: done.

Built:

- Added the mirrored Sun Temple arena with three combat lanes, a stepped pyramid and altar, two smooth tunnel ramps into a lowered trench, four safe alcoves, north colonnades, a four-metre ravine and rope bridge, carved courtyard pools, tall-grass stealth pockets, grapple vines, camp silhouettes, dense jungle boundaries, notes, and journal lighting.
- Added the alternating temple boulder route and altar lever using the shared authoritative hazard system.
- Authored a connected waypoint graph spanning every spawn, both surface lanes, the tunnel, ravine bridge, two complete altar stairways, drops, jumps, and grapple transitions. A walk-only path reaches the altar.
- Added ramp-centering and deterministic stuck recovery to computer-controlled navigation so combat strafing cannot wedge a player against a tunnel lip.
- Added `/?scene=map&map=sun-temple` while keeping ordinary online rooms on the original arena.
- Added a test-only fixed-camera tour API for repeatable landmark captures.

Tests added:

- Sun Temple map validation, including mirrored geometry, grounded volumes, hidden spawns, trap clearance, safe alcoves, spawn distance, graph connectivity, traversable walk links, and walk access to the altar.
- Full eight-player authoritative match simulation through the end phase, with a boulder roll observed and a movement watchdog rejecting any living unprotected player stationary for more than three seconds.
- Four browser views (spawn, altar, tunnel, and courtyard) with zero console errors and a 150-draw-call ceiling. Screenshots are in `test-results/qa/w4/`.

QA:

- `npm run check`: passed with 86 tests.
- `npm run e2e`: 10 passed.
- `npm run size`: client JavaScript 249 KB gzipped, 900 KB budget.
- Diff review: no dependency changes, unsafe randomness, weak typing, forbidden imports, per-tick allocations, or reduced tests were introduced.

Deviation:

- Pyramid tiers are split into quadrants around the three-metre stair channel and the boulder tunnel rather than forming four uninterrupted slabs. Their authored extents and heights are unchanged; the split preserves the specified stairs and gives the three-metre boulder physical clearance.
- Boulder validation treats a supporting ground surface at exactly one radius below the path as support, while still rejecting every wall, ceiling, or raised collider touched by the sweep.

Verify by hand:

- Walk both surface lanes, descend and climb both tunnel ramps, cross the ravine, and climb each altar staircase without a bounce or snag.
- Pull the altar lever while an opponent enters the tunnel, then verify the warning is readable, every alcove is safe, and a trap elimination credits the puller.
- Check all four Sun and Moon spawns from opposing routes and confirm no direct sightline reaches a spawn.
- Play a complete match and confirm opponents rotate among the colonnade, courtyard, tunnel, altar, and bridge rather than collecting at one entrance.

## W3: Props and ambience

Status: done.

Built:

- Added deterministic low-poly builders for all 26 field-guide prop kinds: jungle plants and trees, ruin masonry and carvings, traversal structures, water and mist, expedition camp pieces, and the unmarked plane wreck.
- Batched each prop kind through instanced rendering, applied seed-derived variation, and compacted visible instances each frame so specimens beyond 90 metres are hidden.
- Added visual-only flame flicker, rope and bridge sway, drifting waterfall sheets, and rippling water surfaces.
- Added `/?scene=props`, a jungle-clearing field guide with every prop in a grid and a floating handwritten label for every specimen.
- Added a procedural WebAudio ambience layer with a seeded insect bed and bird cadence, soft wind, distance-driven water, boulder rumble and roll layers, lever clunk, and speed-driven zip whine. It starts only after user interaction.
- Exposed test-only renderer draw-call and triangle statistics.

Tests added:

- Browser gallery proof for all 26 labels, correct scene selection, zero console errors after audio activation, no more than 150 draw calls, and no more than 300,000 visible triangles.
- Gallery screenshot at `test-results/qa/w3/prop-gallery.png`.

QA:

- `npm run check`: passed with 84 tests.
- `npm run e2e`: 9 passed.
- `npm run size`: client JavaScript 247 KB gzipped, 900 KB budget.
- Diff review: no dependency changes, unsafe randomness, weak typing, forbidden imports, per-frame object creation, or reduced tests were introduced. Prop geometry and seed variation are created once; frame updates reuse matrices.

Deviation: none.

Verify by hand:

- Walk through `/?scene=props` and confirm all silhouettes remain readable at distance and share one loose ink-and-watercolor hand.
- Watch flames, water, waterfalls, ropes, and the bridge from near and far; confirm the motion adds life without making collision surfaces appear to move.
- Leave ambience active for five minutes near and far from water, then ride a zip and trigger a boulder; confirm the mix stays subtle and the hazard cues remain clear.

## W2: Map kit v2

Status: done.

Built:

- Expanded map data with axis-aligned ramps, water and tall-grass volumes, zip lines, boulder paths and alcoves, procedural-prop descriptors, field notes, and per-page look settings. Mirroring and validation cover every new primitive.
- Added slope, neighbor-height, grounded-volume, rope-clearance, boulder-sweep, safe-alcove, spawn-distance, and full mirror-symmetry validation, plus a deterministic fixture that exercises the complete kit.
- Added smooth ramp ground snapping for players, sloped projectile impacts, water speed limiting, slide cancellation, water-surface projectile impacts, and match-time-derived flood windows.
- Added crouched tall-grass concealment to computer-controlled sight selection.
- Added F interaction and synchronized zip id/progress state: high-end attachment, deterministic travel, bow use during travel, jump boost, and grapple cancellation all replay through the shared simulation.
- Added synchronized boulder hazards with idle, telegraph, roll, and despawn phases; alternating automatic runs; shared lever cooldown; projectile blocking; instant path kills; puller credit; safe alcoves; feed icon; and a Trap banner.
- Computer-controlled navigation avoids active boulder sweeps and never activates levers.
- Added the playable `/?scene=kit` route with ramp wedges, water and grass volumes, ropes, hazard stone, and lever rendering.

Tests added or updated:

- Broken-fixture proof for each new validation rule, including each mirrored primitive type.
- Player ramp ascent/descent, water speed and slide behavior, flood-window isolation, sloped and water projectile impacts, pure flood height, and tall-grass containment tests.
- Zip attachment, low-end rejection, firing, jump release, grapple cancellation, and a 60-frame authoritative/client/shared progress comparison.
- Boulder lifecycle, alternating direction, cooldown, path interpolation, projectile blocking, authoritative path kill, alcove safety, lever activation, and puller-credit tests.
- Computer-controlled tall-grass blindness, active-path escape, and lever refusal tests.
- Browser proof that the kit route loads all eight authored traversal/hazard primitives, with `test-results/qa/w2/map-kit.png`.

QA:

- `npm run check`: passed with 84 tests.
- `npm run e2e`: 8 passed.
- `npm run size`: client JavaScript 243 KB gzipped, 900 KB budget.
- Break check: removing `zipT` from `PlayerState` left client progress undefined and failed the named 60-frame zip prediction test; restoring the synchronized field returned it to green.
- Diff review: no forbidden dependency changes, imports, unsafe simulation randomness, weak typing, reduced tests, or per-tick collection allocation was introduced. Gameplay tuning remains centralized in `src/shared/constants.ts`.

Deviation:

- None. The installed Colyseus schema exposes the documented 16-bit input and map-schema APIs used by the kit.

Verify by hand:

- At `/?scene=kit`, walk both directions on each ramp and confirm there is no bounce or loss of ground contact at either end.
- Press F at a rope's high end, draw and fire while moving, jump off, and confirm grapple immediately cancels a second ride.
- Wade into water during and outside a flood window and confirm the slowdown appears only while submerged and sliding never starts there.
- Pull the gold lever in an online kit room and judge whether the three-second warning, rolling speed, alcove safety, impact, and Trap banner are readable and satisfying.
- Repeat a zip ride under network latency and confirm the camera never corrects away from the rope.

## W1: Expedition Journal look

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
- Screenshots: `test-results/qa/w1/journal-map.png`, the camp view, and `journal-online.png`.
- Visual inspection: warm washes, dark pooled edges, sepia hatching, compass/grid details, Sun/Moon HUD labels, and gold interactions read clearly; no ruled lines, margin line, or blue-ballpoint world ink remains.

Deviation:

- The pre-existing Practice hit marker could clear before a busy browser runner observed it. Its visible animation now fades while retaining semantic text until the next hit, removing the timing race without sleeps or retries.

Verify by hand:

- Explore the current arena, practice trail, and an online match at 1080p; confirm the wash feels like translucent pigment rather than flat tint and distant geometry fades naturally into the page.
- Confirm Sun orange and Moon indigo players remain instantly distinguishable against every current material.
- Toggle through bright and dark viewpoints and judge whether the subtle grid, stains, compass, and notes support navigation without becoming visual noise.

## M7: Abilities

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

## M6: Highlight moments

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

## M5: Computer-controlled teams

Status: done.

Built:

- A 38-node mirrored prototype navigation graph covering every spawn, both lanes, cover flanks, bridge stairs/top, and perch stairs/top.
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

## M4b: Online combat and match loop

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

## M4a: Online movement

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

## M3: Bow, arrows, dagger, and Practice Camp

Status: done.

Built:

- Shared bow timing, cancel/release edge detection, cooldowns, draw fraction, arrow speed, and damage curves.
- Closed-form projectile integration with swept-sphere world collision, player head/body hitboxes, headshot multiplier, dagger arc/range/backstab checks, damage, death, and regeneration.
- Practice Camp target-lane geometry with five standing targets, two rail targets, slide bars, and step-up course.
- Playable practice session with arrows, wall/body sticking, target damage and respawn, melee, draw crosshair, hit/headshot feedback, and a procedural bow viewmodel.
- Procedural WebAudio draw, release, impact, headshot, and dagger sounds with delayed audio-context creation.
- Deterministic `fireAt` browser hook using the production ballistic and hitbox functions.

Tests added:

- Bow boundary, early-release, cooldown, speed, and damage tests.
- Ballistic position, 95 m/s thin-wall sweep, head/body priority, and crouched-hitbox tests.
- Dagger range, arc, and backstab tests.
- Practice Camp validation and browser full-draw headshot test.
- Screenshot retained with the camp QA captures.

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

## M2: Movement

Status: done.

Built:

- Complete gameplay and netcode constant catalog, allocation-free vector helpers, seeded Mulberry32 RNG, angle helpers, and held-button input frames.
- Shared fixed-step player simulation with Quake-style ground/air acceleration, friction, speed cap, jump buffer, coyote time, automatic bunny hopping, crouch, slide boost/steering/cooldown, aim slowdown, and deterministic state.
- Axis-separated swept player collision with stair step-up, floor/ceiling handling, and a standing-clearance check.
- Browser input sampling with pointer lock and first-person fixed-step offline session using interpolation between simulation states.
- Camera crouch and aim-FOV easing, plus speed, grounded, and sliding values in the F3 overlay.

Tests added:

- Nine movement tests: run acceleration, friction stop, jump apex, air strafe cap, slide rules, bunny-hop retention, exact 0.45 m step-up versus 0.5 m refusal, 10,000-substep wall collision, and 600-frame determinism.
- M2 prototype-map movement screenshot.

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

## M1: Doodle renderer and map data

Status: done.

Built:

- Pure shared map types, `mirrorX`, stair generation, and the prototype shell, cover, stairs, bridge, spawns, and decor.
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
